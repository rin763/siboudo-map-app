class CompaniesController < ApplicationController
  def create
    company = Company.new(company_params.merge(owner_token: current_owner_token))
    if company.save
      render json: company.as_json_for_client, status: :created
    else
      render json: { errors: company.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    company = Company.where(owner_token: current_owner_token).find(params[:id])
    company.destroy
    head :no_content
  end

  private

  def company_params
    params.require(:company).permit(:name)
  end
end
