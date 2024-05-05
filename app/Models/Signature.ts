import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm'

export default class Signature extends BaseModel {

  public static table = 'signature_pools'

  @column({ isPrimary: true })
  public id: number

  @column()
  public signature: string

  @column()
  public token_a: string

  @column()
  public token_b: string

  @column()
  public created_at: string

  @column()
  public updated_at: string
}
