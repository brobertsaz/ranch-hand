module ApiHelpers
  def auth_headers(member)
    { "Authorization" => "Bearer #{member.device_token}" }
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
