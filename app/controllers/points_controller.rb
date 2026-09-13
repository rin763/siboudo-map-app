class PointsController < ApplicationController
  def create
    company = owned_companies.find(point_params[:company_id])
    point = company.points.new(point_params.except(:company_id))
    if point.save
      render json: point.as_json_for_client, status: :created
    else
      render json: { errors: point.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    point = owned_points.find(params[:id])
    # company_id を変更する場合も、変更先が自分の企業であることを確認する
    owned_companies.find(point_params[:company_id]) if point_params[:company_id].present?
    if point.update(point_params)
      render json: point.as_json_for_client
    else
      render json: { errors: point.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    point = owned_points.find(params[:id])
    point.destroy
    head :no_content
  end

  private

  def owned_companies
    Company.where(owner_token: current_owner_token)
  end

  def owned_points
    Point.where(company_id: owned_companies.select(:id))
  end

  # JSON で送るので params.require(:point) ではなく、
  # 送られてきたキーだけを許可する形にしている
  def point_params
    params.permit(:company_id, :x, :y, :what, :info, :emotion, :meaning)
  end
end
