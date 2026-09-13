class MapController < ApplicationController
  def show
    @companies = Company.order(:created_at)
    @points = Point.order(:created_at)
  end
end
