import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const groups = await this.prisma.group.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { members: true } } },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g._count.members,
      createdAt: g.createdAt,
    }));
  }

  async findOne(tenantId: string, id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            membership: {
              include: { user: { select: { id: true, email: true, name: true } } },
            },
          },
        },
      },
    });
    if (!group || group.tenantId !== tenantId) {
      throw new NotFoundException('Group not found');
    }
    return {
      id: group.id,
      name: group.name,
      members: group.members.map((m) => ({
        membershipId: m.membershipId,
        user: m.membership.user,
      })),
    };
  }

  create(tenantId: string, dto: CreateGroupDto) {
    return this.prisma.group.create({ data: { tenantId, name: dto.name } });
  }

  private async getOwnGroup(tenantId: string, id: string) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group || group.tenantId !== tenantId) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async update(tenantId: string, id: string, dto: UpdateGroupDto) {
    await this.getOwnGroup(tenantId, id);
    return this.prisma.group.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(tenantId: string, id: string) {
    await this.getOwnGroup(tenantId, id);
    await this.prisma.group.delete({ where: { id } });
    return { id };
  }

  async addMember(tenantId: string, groupId: string, dto: AddGroupMemberDto) {
    await this.getOwnGroup(tenantId, groupId);
    const membership = await this.prisma.membership.findUnique({
      where: { id: dto.membershipId },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new BadRequestException('Membership not found in this tenant');
    }
    if (membership.role !== Role.STUDENT) {
      throw new BadRequestException('Only students can be added to a group');
    }
    const existing = await this.prisma.groupMember.findUnique({
      where: {
        groupId_membershipId: { groupId, membershipId: dto.membershipId },
      },
    });
    if (existing) {
      throw new ConflictException('This student is already in the group');
    }
    await this.prisma.groupMember.create({
      data: { groupId, membershipId: dto.membershipId },
    });
    return { groupId, membershipId: dto.membershipId };
  }

  async removeMember(tenantId: string, groupId: string, membershipId: string) {
    await this.getOwnGroup(tenantId, groupId);
    await this.prisma.groupMember.deleteMany({ where: { groupId, membershipId } });
    return { groupId, membershipId };
  }
}
