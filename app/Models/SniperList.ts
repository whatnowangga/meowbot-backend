import { BaseModel, column, BelongsTo, belongsTo } from '@ioc:Adonis/Lucid/Orm'
import Token from './Token'

export default class SniperList extends BaseModel {

  public static table = 'snipe_lists'

  @column({ isPrimary: true })
  public id: number

  @column()
  public token: number

  @column()
  public user: number | null

  @column()
  public meta: string

  @column()
  public status: string

  @belongsTo(() => Token, {
    localKey: "id",
    foreignKey: "token",
  })
  public token_info: BelongsTo<typeof Token>

  @column()
  public created_at: string

  @column()
  public updated_at: string
}
