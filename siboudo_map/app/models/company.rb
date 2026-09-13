class Company < ApplicationRecord
  has_many :points, dependent: :destroy

  validates :name, presence: true

  # 赤系のパレット。company の color_index はレコード作成順に割り当て、
  # フロント側の PALETTE 配列（motivation_map_controller.js）とインデックスを揃えている。
  PALETTE = [
    { main: "#C0392B", soft: "#F7DAD5" },
    { main: "#E4573F", soft: "#FBE2DC" },
    { main: "#A93226", soft: "#F3D7D1" },
    { main: "#D96E5B", soft: "#F8E2DB" },
    { main: "#8E2E23", soft: "#EFD5CF" },
    { main: "#E28F7C", soft: "#FBEAE5" },
    { main: "#B33F32", soft: "#F5DBD5" },
    { main: "#C97A63", soft: "#F6E4DC" }
  ].freeze

  before_create :assign_color_index

  def color
    PALETTE[color_index % PALETTE.length]
  end

  def as_json_for_client
    { id: id, name: name, color_index: color_index }
  end

  private

  def assign_color_index
    self.color_index = Company.count
  end
end
