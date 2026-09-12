class CreatePoints < ActiveRecord::Migration[7.1]
  def change
    create_table :points do |t|
      t.references :company, null: false, foreign_key: true
      t.float :x, null: false
      t.float :y, null: false
      t.text :what
      t.text :info
      t.text :emotion
      t.text :meaning

      t.timestamps
    end
  end
end
