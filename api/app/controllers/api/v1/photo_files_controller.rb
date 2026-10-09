module Api
  module V1
    # Image bytes travel separately from the synced photo record, as a raw request body
    class PhotoFilesController < BaseController
      def show
        photo = current_ranch.photos.live.find(params[:photo_id])
        return head :not_found unless photo.file.attached?

        redirect_to rails_blob_url(photo.file, disposition: "inline"), allow_other_host: false
      end

      def update
        photo = current_ranch.photos.live.find(params[:photo_id])
        body = request.raw_post
        return head :unprocessable_content if body.blank?

        photo.attach_file!(
          # Rack 3 bodies can't be rewound, and Active Storage reads twice (checksum, then upload)
          io: StringIO.new(body),
          filename: "#{photo.id}.jpg",
          content_type: request.content_type.presence || "image/jpeg"
        )
        head :no_content
      end
    end
  end
end
