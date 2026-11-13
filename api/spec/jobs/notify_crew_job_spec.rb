require "rails_helper"

RSpec.describe NotifyCrewJob do
  let(:author) { create(:member) }

  before { allow(PushNotifier).to receive(:logged) }

  it "passes along what's still open, oldest first" do
    later = create(:observation, member: author, observed_at: 1.minute.ago)
    earlier = create(:observation, member: author, observed_at: 1.hour.ago)
    resolved = create(:observation, member: author, status: "resolved")
    deleted = create(:observation, member: author, deleted_at: Time.current)
    elsewhere = create(:observation)

    described_class.perform_now(author, [ later, earlier, resolved, deleted, elsewhere ].map(&:id))

    expect(PushNotifier).to have_received(:logged).with(author: author, observations: [ earlier, later ])
  end
end
