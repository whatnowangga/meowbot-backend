import { BaseModel, column, } from '@ioc:Adonis/Lucid/Orm'
import { adminColumn } from '@ioc:Adonis/Addons/AdminJS'

export default class Wallet extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public user: number | null

  @column()
  public address: string

  @column()
  @adminColumn({
    visible: false
  })
  public privatekey: string

  @column()
  public meta: string

  @column()
  public created_at: string

  @column()
  public updated_at: string
}
