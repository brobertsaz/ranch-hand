# shortcut: renders run in the web process (Active Job's default async adapter), so a deploy stops them midway and
# this restarts them on boot. Upgrade to Solid Queue if the API ever runs on more than one server.
Rails.application.config.after_initialize do
  MapArea.resume_unfinished if defined?(Rails::Server)
end
