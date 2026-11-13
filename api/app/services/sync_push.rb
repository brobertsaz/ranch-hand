# Applies WatermelonDB's pushChanges payload.
#
# Conflict policy: PLAN.md started with "last-write-wins per record"; it is now last write wins per field.
# An updated record can carry "_changed", the names of the fields this phone edited since it last synced
# the row, and only those are applied. So a note typed offline doesn't undo a teammate's resolve that
# synced in the meantime, whichever of the two arrives first. Without "_changed" (an older app) the whole
# record is applied, and a created record always is.
#
# Each record is applied on its own. One that can't be (invalid, pointing at something the server doesn't
# have, an id that belongs to another ranch) is skipped and reported back; the rest still go in. An
# all-or-nothing push meant one bad record blocked everything behind it on that phone for good.
class SyncPush
  # The payload isn't the shape the protocol sends, so nothing in it can be applied
  class Malformed < StandardError; end
  # This one record can't be applied; the message goes back to the phone
  class Rejected < StandardError; end

  # parents before children: observations point at waypoints, photos at observations
  TABLES = { "waypoints" => Waypoint, "observations" => Observation, "photos" => Photo, "rides" => Ride }.freeze
  LISTS = %w[created updated deleted].freeze
  # Set by the server when the status changes (see credit_resolver), so never merged in by name
  SERVER_SET_FIELDS = %w[resolved_at resolved_by_id].freeze
  # A phone coming back into range can push a week of work. Past this many new problems the crew gets one
  # notification that counts them, not a buzz for each.
  NOTIFY_EACH_UP_TO = 3

  def initialize(member:, changes:)
    @member = member
    @ranch = member.ranch
    @changes = changes
    @rejected = []
    @logged = []
  end

  # Returns the records that were skipped: [{ table:, id:, reason: }]
  def call
    check_shape!
    TABLES.each { |table, model| apply(model, table) }
    # After the records are in, so the job never looks for one that was rolled back
    NotifyCrewJob.perform_later(@member, @logged) if @logged.any?
    @rejected
  end

  private

  def check_shape!
    raise Malformed, "changes must be an object" unless @changes.is_a?(Hash)

    @changes.slice(*TABLES.keys).each do |table, changes|
      raise Malformed, "#{table} must be an object" unless changes.is_a?(Hash)

      LISTS.each do |list|
        raise Malformed, "#{table}.#{list} must be a list" unless changes[list].nil? || changes[list].is_a?(Array)
      end
      unless (Array(changes["created"]) + Array(changes["updated"])).all?(Hash)
        raise Malformed, "#{table} records must be objects"
      end
    end
  end

  def apply(model, table)
    changes = @changes.fetch(table, {})

    Array(changes["created"]).each do |raw|
      attempt(table, raw["id"]) { save(model, raw) }
    end

    Array(changes["updated"]).each do |raw|
      attempt(table, raw["id"]) { save(model, raw, merge: true) }
    end

    Array(changes["deleted"]).each do |id|
      attempt(table, id) { delete(model, id) }
    end
  end

  # Its own transaction (a savepoint under test), so a record the database refuses doesn't take the others with it
  def attempt(table, id)
    tries = 0
    begin
      check_id!(id)
      ActiveRecord::Base.transaction(requires_new: true) { yield }
    rescue ActiveRecord::RecordNotUnique
      # The same new record arriving twice at once (a retried push): the second time round it's an update
      retry if (tries += 1) < 2
      reject(table, id, "could not be saved")
    rescue Rejected => error
      reject(table, id, error.message)
    rescue ActiveRecord::RecordInvalid => error
      reject(table, id, error.record.errors.full_messages.to_sentence)
    rescue ActiveRecord::InvalidForeignKey
      reject(table, id, "points at a record the server doesn't have")
    rescue StandardError => error
      # Whatever else a phone manages to send (a date in the year 300000, a number where text belongs) costs
      # it that one record, not its whole sync. Reported so it gets looked at.
      Rails.error.report(error, handled: true, context: { table: table, id: id.to_s.first(Syncable::ID_LIMIT) })
      reject(table, id, "could not be saved")
    end
  end

  def reject(table, id, reason)
    @rejected << { table: table, id: id.is_a?(String) ? id.first(Syncable::ID_LIMIT) : nil, reason: reason }
  end

  # Before any lookup: an array here would otherwise turn into WHERE id IN (...)
  def check_id!(id)
    return if id.is_a?(String) && id.length.between?(1, Syncable::ID_LIMIT)

    raise Rejected, "id must be text of 1 to #{Syncable::ID_LIMIT} characters"
  end

  def save(model, raw, merge: false)
    record = find_or_build(model, raw["id"])
    return if record.deleted_at?

    attributes = attributes_for(model, raw)
    # An update for a record the server never got (its create was rejected, say) goes in whole, as a create.
    # Only a list counts: older apps send "_changed" as a counter or an empty string.
    if merge && record.persisted? && raw["_changed"].is_a?(Array)
      attributes = attributes.slice(*fields_to_merge(model, raw["_changed"]))
      # Nothing this phone changed, so nothing to save and no new updated_at to send every other phone
      return if attributes.empty?
    end

    record.member ||= @member unless record.is_a?(Photo)
    record.assign_attributes(attributes)
    if record.is_a?(Observation)
      credit_resolver(record)
      credit_claimer(record)
    end
    news = record.is_a?(Observation) && record.new_record? && record.open?
    record.save!
    # A problem the crew hasn't heard about. Routine all-clear checks and edits aren't worth a buzz.
    @logged << record.id if news
  end

  # What the phone sent, keyed by the field names it uses (which are our column names)
  def attributes_for(model, raw)
    return model.attributes_from_raw(raw).stringify_keys unless model == Photo

    observation_id = raw["observation_id"]
    # An observation that isn't this ranch's is treated as missing, which fails validation
    known = observation_id.is_a?(String) && @ranch.observations.exists?(id: observation_id)
    { "observation_id" => (observation_id if known) }
  end

  # Names the server doesn't know drop out when the attributes are sliced
  def fields_to_merge(model, changed)
    fields = changed.grep(String)
    return fields unless model == Observation

    fields -= SERVER_SET_FIELDS
    # The time on the phone when it was resolved travels with the status, and when it was claimed with the claim
    fields += %w[resolved_at] if fields.include?("status")
    fields += %w[claimed_at] if fields.include?("claimed_by_id")
    fields
  end

  def delete(model, id)
    record = model.find_by(id: id)
    return if record.nil? || record.deleted_at?

    authorize!(record)
    # Touching it instead sends the record back down on the phone's next pull
    return record.touch unless deletable?(record)

    record.soft_delete!
  end

  def find_or_build(model, id)
    record = model.find_or_initialize_by(id: id)
    record.new_record? ? record.ranch = @ranch : authorize!(record)
    record
  end

  # Says nothing about whose it is: the phone only learns the id is taken
  def authorize!(record)
    raise Rejected, "id is already in use" unless record.ranch_id == @ranch.id
  end

  # Only an owner can remove a place, so the crew's gate list can't vanish by accident. A pin logged by
  # mistake goes when the hand who logged it, or the owner, says so; nobody else's can be thrown away.
  def deletable?(record)
    case record
    when Waypoint then @member.owner?
    when Observation then @member.owner? || record.member_id == @member.id
    else true
    end
  end

  # Whoever pushes the change that resolves it gets the credit, whatever the phone says; reopening clears it
  def credit_resolver(observation)
    if !observation.resolved?
      observation.assign_attributes(resolved_by: nil, resolved_at: nil)
    elsif observation.status_changed?
      observation.resolved_by = @member
      observation.resolved_at ||= Time.current
    else
      # Already resolved, and this is some other edit: the first resolver and their time stand
      observation.restore_attributes(%w[resolved_at])
    end
  end

  # Like resolving: a hand can only claim it for themself, whatever id the phone sent. Letting go clears it,
  # and so does a claim that arrives with nobody's name on it.
  def credit_claimer(observation)
    if observation.claimed_by_id.nil?
      observation.claimed_at = nil
    elsif observation.claimed_by_id_changed?
      observation.claimed_by = @member
      observation.claimed_at ||= Time.current
    else
      # Still claimed by whoever had it, and this is some other edit: their time stands
      observation.restore_attributes(%w[claimed_at])
    end
  end
end
