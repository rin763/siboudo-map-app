class Company < ApplicationRecord
  has_many :points, dependent: :destroy

  validates :name, presence: true

  # company の color_index はレコード作成順に割り当て、
  # フロント側の PALETTE 配列（motivation_map_controller.js）とインデックスを揃えている。
  PALETTE = [
    { main: "#293767", soft: "#E0E2E8" },
    { main: "#4A5EA3", soft: "#E5E7F4" },
    { main: "#8B9EE0", soft: "#EDF0FA" },
    { main: "#E7D6C9", soft: "#F5EEE9" }
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
