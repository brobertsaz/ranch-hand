require "rails_helper"

RSpec.describe "Photo files", type: :request do
  let(:photo) { create(:photo) }
  let(:member) { photo.observation.member }
  let(:jpeg) { file_fixture("tag.jpg").binread }

  def upload(body, as: member)
    put "/api/v1/photos/#{photo.id}/file", params: body,
      headers: auth_headers(as).merge("Content-Type" => "image/jpeg")
  end

  it "attaches the raw request body and stamps uploaded_at" do
    upload(jpeg)

    expect(response).to have_http_status(:no_content)
    expect(photo.reload.file.download.b).to eq(jpeg)
    expect(photo.uploaded_at).to be_present
  end

  it "rejects an empty body" do
    upload("")

    expect(response).to have_http_status(:unprocessable_content)
    expect(photo.reload.file).not_to be_attached
  end

  it "hides photos from other ranches" do
    upload(jpeg, as: create(:member))

    expect(response).to have_http_status(:not_found)
  end

  it "404s a photo whose file has not arrived yet" do
    get "/api/v1/photos/#{photo.id}/file", headers: auth_headers(member)

    expect(response).to have_http_status(:not_found)
  end
end
