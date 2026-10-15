import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsString,
  MaxLength, MinLength, ValidateNested
} from 'class-validator';
import { ASSISTANT_EVENTS, ASSISTANT_TOPICS } from '../assistant-console.service';

export class AssistantFaqDto {
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  question!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(650)
  answer!: string;
}

export class SaveAssistantConfigurationDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MinLength(8)
  @MaxLength(350)
  welcomeMessage!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AssistantFaqDto)
  faqs!: AssistantFaqDto[];
}

export class AssistantMetricDto {
  @IsIn([...ASSISTANT_EVENTS])
  event!: (typeof ASSISTANT_EVENTS)[number];

  @IsIn([...ASSISTANT_TOPICS])
  topic!: (typeof ASSISTANT_TOPICS)[number];
}
