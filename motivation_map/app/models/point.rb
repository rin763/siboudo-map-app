class Point < ApplicationRecord
  belongs_to :company

  validates :x, :y, presence: true, numericality: { in: 0.0..1.0 }

  def as_json_for_client
    {
      id: id,
      company_id: company_id,
      x: x,
      y: y,
      what: what.to_s,
      info: info.to_s,
      emotion: emotion.to_s,
      meaning: meaning.to_s
    }
  end
end
