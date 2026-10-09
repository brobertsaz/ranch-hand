Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :devices, only: :create
      resource :sync, only: %i[show create]
      resources :photos, only: [] do
        resource :file, only: %i[show update], controller: :photo_files
      end
      get "map/style", to: "map_styles#show", defaults: { format: :json }
    end
  end
end
