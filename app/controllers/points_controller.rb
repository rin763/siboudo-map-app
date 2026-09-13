class PointsController < ApplicationController
  def create
    point = Point.new(point_params)
    if point.save
      render json: point.as_json_for_client, status: :created
    else
      render json: { errors: point.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    point = Point.find(params[:id])
    if point.update(point_params)
      render json: point.as_json_for_client
    else
      render json: { errors: point.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    point = Point.find(params[:id])
    point.destroy
    head :no_content
  end

  private

  # JSON で送るので params.require(:point) ではなく、
  # 送られてきたキーだけを許可する形にしている
  def point_params
    params.permit(:company_id, :x, :y, :what, :info, :emotion, :meaning)
  end
end
