class AddOwnerTokenToCompanies < ActiveRecord::Migration[7.2]
  def change
    add_column :companies, :owner_token, :string
    add_index :companies, :owner_token
  end
end
