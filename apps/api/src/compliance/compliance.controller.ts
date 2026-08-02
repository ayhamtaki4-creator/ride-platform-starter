import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { AttachDriverAvatarDto } from './dto/attach-driver-avatar.dto';
import { AttachVehicleImageDto } from './dto/attach-vehicle-image.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UpsertRequirementDto } from './dto/upsert-requirement.dto';
import { ComplianceService } from './compliance.service';

@ApiTags('Administration - Fleet Compliance')
@ApiBearerAuth()
@Controller('admin')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Permissions('compliance:read')
  @Get('compliance/requirements')
  requirements() {
    return this.compliance.listRequirements();
  }

  @Permissions('compliance:manage')
  @Put('compliance/requirements')
  upsertRequirement(@CurrentUser() actor: AuthUser, @Body() dto: UpsertRequirementDto) {
    return this.compliance.upsertRequirement(actor, dto);
  }

  @Permissions('compliance:read')
  @Get('compliance/expiring')
  expiring(@Query('days') days?: string) {
    return this.compliance.expiring(days ? Number(days) : 30);
  }

  @Permissions('compliance:manage')
  @Post('compliance/refresh-expired')
  refreshExpired() {
    return this.compliance.refreshExpiredDocuments();
  }

  @Permissions('compliance:read')
  @Get('drivers/:driverId/documents')
  driverDocuments(@Param('driverId') driverId: string) {
    return this.compliance.listDriverDocuments(driverId);
  }

  @Permissions('compliance:manage')
  @Post('drivers/:driverId/documents')
  createDriverDocument(
    @CurrentUser() actor: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: CreateDocumentDto
  ) {
    return this.compliance.createDriverDocument(actor, driverId, dto);
  }

  @Permissions('compliance:manage')
  @Patch('drivers/:driverId/documents/:documentId')
  updateDriverDocument(
    @CurrentUser() actor: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentDto
  ) {
    return this.compliance.updateDriverDocument(actor, driverId, documentId, dto);
  }

  @Permissions('compliance:manage')
  @Post('drivers/:driverId/documents/:documentId/approve')
  approveDriverDocument(
    @CurrentUser() actor: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string
  ) {
    return this.compliance.reviewDriverDocument(actor, driverId, documentId, 'APPROVED');
  }

  @Permissions('compliance:manage')
  @Post('drivers/:driverId/documents/:documentId/reject')
  rejectDriverDocument(
    @CurrentUser() actor: AuthUser,
    @Param('driverId') driverId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ReviewDocumentDto
  ) {
    return this.compliance.reviewDriverDocument(actor, driverId, documentId, 'REJECTED', dto.reason);
  }

  @Permissions('compliance:manage')
  @Post('drivers/:driverId/avatar')
  attachAvatar(
    @CurrentUser() actor: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: AttachDriverAvatarDto
  ) {
    return this.compliance.attachDriverAvatar(actor, driverId, dto.mediaAssetId);
  }

  @Permissions('compliance:read')
  @Get('vehicles/:vehicleId/documents')
  vehicleDocuments(@Param('vehicleId') vehicleId: string) {
    return this.compliance.listVehicleDocuments(vehicleId);
  }

  @Permissions('compliance:manage')
  @Post('vehicles/:vehicleId/documents')
  createVehicleDocument(
    @CurrentUser() actor: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreateDocumentDto
  ) {
    return this.compliance.createVehicleDocument(actor, vehicleId, dto);
  }

  @Permissions('compliance:manage')
  @Patch('vehicles/:vehicleId/documents/:documentId')
  updateVehicleDocument(
    @CurrentUser() actor: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentDto
  ) {
    return this.compliance.updateVehicleDocument(actor, vehicleId, documentId, dto);
  }

  @Permissions('compliance:manage')
  @Post('vehicles/:vehicleId/documents/:documentId/approve')
  approveVehicleDocument(
    @CurrentUser() actor: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string
  ) {
    return this.compliance.reviewVehicleDocument(actor, vehicleId, documentId, 'APPROVED');
  }

  @Permissions('compliance:manage')
  @Post('vehicles/:vehicleId/documents/:documentId/reject')
  rejectVehicleDocument(
    @CurrentUser() actor: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ReviewDocumentDto
  ) {
    return this.compliance.reviewVehicleDocument(actor, vehicleId, documentId, 'REJECTED', dto.reason);
  }

  @Permissions('compliance:manage')
  @Post('drivers/:driverId/vehicles/:vehicleId/media-images')
  attachVehicleImage(
    @CurrentUser() actor: AuthUser,
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: AttachVehicleImageDto
  ) {
    return this.compliance.attachVehicleImage(actor, driverId, vehicleId, dto);
  }
}
