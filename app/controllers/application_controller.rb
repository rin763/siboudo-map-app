class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  before_action :ensure_owner_token
  rescue_from ActiveRecord::RecordNotFound do
    render json: { errors: ["見つかりませんでした"] }, status: :not_found
  end

  private

  # ログイン機能の代わりに、ブラウザごとの匿名IDを長期Cookieで発行する。
  # これにより端末（ブラウザ）ごとにデータが自動的に分離される。
  def ensure_owner_token
    cookies.permanent.signed[:owner_token] ||= SecureRandom.uuid
  end

  def current_owner_token
    cookies.permanent.signed[:owner_token]
  end
end
