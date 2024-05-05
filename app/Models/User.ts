import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'
import { adminColumn } from '@ioc:Adonis/Addons/AdminJS'
export default class User extends BaseModel {

  public static table = 'users'

  @column({ isPrimary: true })
  public id: number

  @column()
  public user_id: number

  @column()
  public ref_by: number

  @column()
  public username: string

  @column()
  public status: string

  @column()
  @adminColumn({
    visible: false
  })
  public meta: string

  @column()
  public created_at: string

  @column()
  public updated_at: string
}
