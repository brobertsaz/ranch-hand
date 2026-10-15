# The landing page lives on Cloudflare Pages at getranchhand.com and posts its sign-up form here.
# Only that route is opened up; the app talks to the API directly and needs no CORS.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "https://getranchhand.com", "https://www.getranchhand.com", %r{\Ahttps://([a-z0-9-]+\.)?ranch-hand-site\.pages\.dev\z}

    resource "/api/v1/signups", headers: :any, methods: %i[post options]
  end
end
