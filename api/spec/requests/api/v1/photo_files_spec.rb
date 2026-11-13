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

  it "stores it as a JPEG whatever the phone calls it" do
    put "/api/v1/photos/#{photo.id}/file", params: jpeg, headers: auth_headers(member).merge("Content-Type" => "text/html")

    expect(response).to have_http_status(:no_content)
    expect(photo.reload.file.content_type).to eq("image/jpeg")
  end

  it "rejects a body that isn't a JPEG, whatever the phone calls it" do
    upload("<html><script>alert(1)</script></html>")

    expect(response).to have_http_status(:unsupported_media_type)
    expect(photo.reload.file).not_to be_attached
    expect(photo.uploaded_at).to be_nil
  end

  describe "past the size limit" do
    before { stub_const("Api::V1::PhotoFilesController::MAX_BYTES", jpeg.bytesize - 1) }

    it "rejects it on the Content-Length alone" do
      upload(jpeg)

      expect(response).to have_http_status(:content_too_large)
      expect(photo.reload.file).not_to be_attached
    end

    it "rejects it when the phone doesn't say how much is coming" do
      put "/api/v1/photos/#{photo.id}/file", headers: auth_headers(member),
        env: { "rack.input" => StringIO.new(jpeg), "CONTENT_TYPE" => "image/jpeg", "HTTP_TRANSFER_ENCODING" => "chunked" }

      expect(response).to have_http_status(:content_too_large)
      expect(photo.reload.file).not_to be_attached
    end
  end

  it "takes a photo right at the limit" do
    stub_const("Api::V1::PhotoFilesController::MAX_BYTES", jpeg.bytesize)

    upload(jpeg)

    expect(response).to have_http_status(:no_content)
  end

  it "won't take a file for a photo that was deleted" do
    photo.soft_delete!

    upload(jpeg)

    expect(response).to have_http_status(:not_found)
  end
end
