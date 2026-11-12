module Api
  module V1
    # Image bytes travel separately from the synced photo record, as a raw request body
    class PhotoFilesController < BaseController
      # The app's photos run 2-5 MB; this leaves room for a better camera without taking whatever is sent
      MAX_BYTES = 15.megabytes
      # How every JPEG starts
      JPEG_MAGIC = "\xFF\xD8\xFF".b.freeze

      def show
        photo = current_ranch.photos.live.find(params[:photo_id])
        return head :not_found unless photo.file.attached?

        redirect_to rails_blob_url(photo.file, disposition: "inline"), allow_other_host: false
      end

      def update
        photo = current_ranch.photos.live.find(params[:photo_id])
        # Turned away on the header alone when the phone says how much is coming
        return head :content_too_large if request.content_length.to_i > MAX_BYTES

        # One byte past the limit is enough to know it's over, without holding the rest in memory.
        # shortcut: Puma has already spooled the whole body to a temp file by now, so this bounds memory but
        # not disk. Cap it at the proxy (Cloudflare, or nginx's client_max_body_size) when one sits in front for real.
        body = request.body.read(MAX_BYTES + 1).to_s
        return head :unprocessable_content if body.empty?
        return head :content_too_large if body.bytesize > MAX_BYTES
        # The bytes decide, not the Content-Type header, which the sender picks
        return head :unsupported_media_type unless body.start_with?(JPEG_MAGIC)

        photo.attach_file!(
          # Rack 3 bodies can't be rewound, and Active Storage reads twice (checksum, then upload)
          io: StringIO.new(body),
          filename: "#{photo.id}.jpg",
          content_type: "image/jpeg",
          # Active Storage would otherwise sniff the type again and could file it as something else
          identify: false
        )
        head :no_content
      end
    end
  end
end
