# After a push brings in new open problems, tell the rest of the crew's phones (see PushNotifier)
class NotifyCrewJob < ApplicationJob
  # The hand, or their ranch, was deleted before this ran
  discard_on ActiveJob::DeserializationError

  def perform(author, observation_ids)
    # Resolved or deleted in the moment since they were pushed: no longer news
    observations = author.ranch.observations.live.open.where(id: observation_ids).order(:observed_at).to_a
    PushNotifier.logged(author: author, observations: observations)
  end
end
