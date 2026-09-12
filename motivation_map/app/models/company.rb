class Company < ApplicationRecord
  has_many :points, dependent: :destroy

  validates :name, presence: true

  # 緑系のパレット。company の color_index はレコード作成順に割り当て、
  # フロント側の PALETTE 配列（motivation_map_controller.js）とインデックスを揃えている。
  PALETTE = [
    { main: "#1F6D45", soft: "#DCEEE1" },
    { main: "#2E8B57", soft: "#E1F0E5" },
    { main: "#146356", soft: "#DAEAE7" },
    { main: "#6B8E23", soft: "#EBEEDA" },
    { main: "#0F5132", soft: "#D9E7DF" },
    { main: "#3E8E7E", soft: "#DDEEEA" },
    { main: "#5C7A29", soft: "#E7EBD9" },
    { main: "#2F6F4E", soft: "#DEECE3" }
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
