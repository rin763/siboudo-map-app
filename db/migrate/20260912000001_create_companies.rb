class CreateCompanies < ActiveRecord::Migration[7.1]
  def change
    create_table :companies do |t|
      t.string :name, null: false
      t.integer :color_index, null: false, default: 0

      t.timestamps
    end
  end
end
