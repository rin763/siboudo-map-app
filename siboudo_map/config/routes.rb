Rails.application.routes.draw do
  root "map#show"

  resources :companies, only: [:create, :destroy]
  resources :points, only: [:create, :update, :destroy]
end
