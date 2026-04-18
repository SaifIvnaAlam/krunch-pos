import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderLineInputDto {
  @IsUUID()
  stockItemId!: string;

  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  quantityOrdered!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost?: number;
}
