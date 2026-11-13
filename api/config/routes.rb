Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  get "signups", to: "signups#index"

  namespace :api do
    namespace :v1 do
      resources :devices, only: :create
      # The phone's own membership: deleting it leaves the ranch (a hand) or signs this phone out (an owner)
      resource :device, only: :destroy
      # Where to send this phone the crew's news
      resource :push_token, only: %i[update destroy]
      resources :members, only: :destroy
      # Deleting your account: a hand is forgotten, an owner takes the ranch with them
      resource :account, only: :destroy
      resources :owners, only: :create
      resources :signups, only: :create
      resource :sync, only: %i[show create]
      resource :ranch, only: %i[show update] do
        post :invite_code
      end
      resources :photos, only: [] do
        resource :file, only: %i[show update], controller: :photo_files
      end
      get "map/style", to: "map_styles#show", defaults: { format: :json }
      get "map/tiles/:z/:x/:y.jpg", to: "map_tiles#show", format: false, constraints: { z: /\d+/, x: /\d+/, y: /\d+/ }
      get "map/tiles/:source/:z/:x/:y.jpg", to: "map_tiles#show", format: false,
        constraints: { source: Regexp.union(ImagerySource::ALL.keys), z: /\d+/, x: /\d+/, y: /\d+/ }
      resources :map_areas, only: %i[index new create destroy]
    end
  end
end
