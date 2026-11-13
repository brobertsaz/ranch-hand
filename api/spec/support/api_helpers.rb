module ApiHelpers
  def auth_headers(member)
    { "Authorization" => "Bearer #{device_of(member).token}" }
  end

  # The phone a spec's member is signed in on, made the first time it's asked for
  def device_of(member)
    member.devices.order(:id).first || member.sign_in!
  end

  def json
    response.parsed_body
  end

  def to_ms(time)
    Syncable.to_ms(time)
  end
end

RSpec.configure do |config|
  config.include ApiHelpers, type: :request
  config.include ActiveSupport::Testing::TimeHelpers
end
