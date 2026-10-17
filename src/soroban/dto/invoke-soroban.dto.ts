import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SorobanNetwork } from '../soroban-invoke.model';

/**
 * Request body for `POST /v1/soroban/invoke`.
 *
 * Validated at the edge by the global `ValidationPipe` so type confusion
 * (bad network, non-array args, stringified booleans, negative fees) is
 * rejected with a 400 before it reaches the money path.
 */
export class InvokeSorobanDto {
  @IsString()
  contract!: string;

  @IsString()
  functionName!: string;

  @IsArray()
  args!: unknown[];

  @IsEnum(SorobanNetwork)
  network!: SorobanNetwork;

  @IsOptional()
  @IsBoolean()
  simulateOnly?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxFee?: number;
}
