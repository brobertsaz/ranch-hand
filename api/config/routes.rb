Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :devices, only: :create
      resources :signups, only: :create
      resource :sync, only: %i[show create]
      resource :ranch, only: :show
      resources :photos, only: [] do
        resource :file, only: %i[show update], controller: :photo_files
      end
      get "map/style", to: "map_styles#show", defaults: { format: :json }
      get "map/tiles/:z/:x/:y.jpg", to: "map_tiles#show", format: false, constraints: { z: /\d+/, x: /\d+/, y: /\d+/ }
      resources :map_areas, only: %i[index create]
    end
  end
end
