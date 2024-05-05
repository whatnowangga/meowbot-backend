import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

export default class Token extends BaseModel {

  public static table = 'token_lists'

  @column({ isPrimary: true })
  public id: number

  @column()
  public address: string

  @column()
  public name: string

  @column()
  public symbol: string

  @column()
  public decimals: number

  @column()
  public meta: string

  @column()
  public created_at: string

  @column()
  public updated_at: string
}
