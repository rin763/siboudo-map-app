class MapController < ApplicationController
  def show
    @companies = Company.where(owner_token: current_owner_token).order(:created_at)
    @points = Point.where(company_id: @companies.select(:id)).order(:created_at)
  end
end
