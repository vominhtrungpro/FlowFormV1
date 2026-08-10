import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SaveFieldDto } from './dto/save-field.dto';
import { ReorderFieldNode } from './dto/reorder-fields.dto';

const PAGE_SIZE = 10;

@Injectable()
export class FormsService {
  constructor(private prisma: PrismaService) {}

  async list(q?: string, status?: string, page = 1) {
    const where: any = {};
    if (q) where.name = { contains: q };
    if (status) where.status = status;

    const all = await this.prisma.db.formDefinition.findMany({
      where,
      include: { fields: { where: { metaIsDeleted: false } } },
      orderBy: { id: 'desc' },
    });

    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const pageClamped = Math.max(1, page);
    const items = all.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

    return {
      page: pageClamped,
      totalPages,
      items: items.map((f) => ({ id: f.id, name: f.name, versionNumber: f.versionNumber, status: f.status, fieldCount: f.fields.length })),
    };
  }

  async getDesign(formId: number, fieldId?: number) {
    const form = await this.prisma.db.formDefinition.findFirst({ where: { id: formId } });
    if (!form) throw new NotFoundException();

    const fields = await this.prisma.db.field.findMany({ where: { formDefinitionId: formId }, orderBy: { orderIndex: 'asc' } });
    const selected = (fieldId && fields.find((f) => f.id === fieldId)) || fields[0] || null;

    return { form, fields, selected };
  }

  async saveMeta(formId: number, name: string, status: string) {
    const form = await this.prisma.db.formDefinition.findFirst({ where: { id: formId } });
    if (!form) throw new NotFoundException();
    await this.prisma.db.formDefinition.update({ where: { id: formId }, data: { name, status } });
  }

  async deleteForm(formId: number) {
    const referencing = await this.prisma.db.step.count({ where: { formDefinitionId: formId } });
    if (referencing > 0) throw new BadRequestException('A workflow step still uses this form — it cannot be removed.');

    const form = await this.prisma.db.formDefinition.findFirst({ where: { id: formId } });
    if (!form) throw new NotFoundException();
    await this.prisma.db.formDefinition.update({ where: { id: formId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
  }

  async createForm(name: string) {
    const form = await this.prisma.db.formDefinition.create({ data: { name, versionNumber: 1, status: 'Draft' } });
    return { id: form.id };
  }

  async publish(formId: number) {
    const form = await this.prisma.db.formDefinition.findFirst({ where: { id: formId } });
    if (!form) throw new NotFoundException();
    await this.prisma.db.formDefinition.update({ where: { id: formId }, data: { status: 'Published' } });
  }

  async addField(formDefinitionId: number, type?: string, parentFieldId?: number | null) {
    const resolvedType = type ?? 'Text';
    const resolvedParentId = resolvedType === 'Section' ? null : parentFieldId ?? null; // Sections can't nest

    const siblings = await this.prisma.db.field.findMany({ where: { formDefinitionId, parentFieldId: resolvedParentId } });
    const orderIndex = siblings.length === 0 ? 0 : Math.max(...siblings.map((f) => f.orderIndex)) + 1;

    const field = await this.prisma.db.field.create({
      data: {
        formDefinitionId,
        parentFieldId: resolvedParentId,
        orderIndex,
        label: `New ${resolvedType} field`,
        type: resolvedType,
        width: 'Full',
        includeInPrintSummary: true,
        trackAuditLog: true,
      },
    });
    return { id: field.id };
  }

  async saveField(fieldId: number, dto: SaveFieldDto) {
    const field = await this.prisma.db.field.findFirst({ where: { id: fieldId } });
    if (!field) throw new NotFoundException();

    let optionsValue: string | null = null;
    if (dto.type === 'Table') {
      optionsValue = JSON.stringify((dto.tableColumns ?? []).filter((c) => c.name?.trim()));
    } else if (dto.type === 'Dropdown' || dto.type === 'Checklist') {
      optionsValue = dto.options ?? null;
    }

    await this.prisma.db.field.update({
      where: { id: fieldId },
      data: {
        label: dto.label,
        helpText: dto.helpText || null,
        type: dto.type,
        width: dto.width,
        required: !!dto.required,
        readOnlyAfterSubmit: !!dto.readOnlyAfterSubmit,
        includeInPrintSummary: dto.includeInPrintSummary ?? true,
        trackAuditLog: dto.trackAuditLog ?? true,
        visibilityCondition: dto.visibilityCondition || null,
        defaultValue: dto.defaultValue || null,
        options: optionsValue,
        minLength: dto.minLength ?? null,
        maxLength: dto.maxLength ?? null,
        minValue: dto.minValue ?? null,
        maxValue: dto.maxValue ?? null,
        minDate: dto.minDate ? new Date(dto.minDate) : null,
        maxDate: dto.maxDate ? new Date(dto.maxDate) : null,
        maxFileSizeMb: dto.maxFileSizeMb ?? null,
        pickerActorType: dto.pickerActorType || null,
        pickerActorRef: dto.pickerActorRef || null,
        useForNextStepActor: !!dto.useForNextStepActor,
      },
    });
    return { id: fieldId };
  }

  // Removing a Section does NOT cascade-delete its children — they're promoted to top-level,
  // appended after the current last top-level field, preserving their relative order.
  async removeField(fieldId: number) {
    const field = await this.prisma.db.field.findFirst({ where: { id: fieldId } });
    if (!field) throw new NotFoundException();

    if (field.type === 'Section') {
      const children = await this.prisma.db.field.findMany({ where: { parentFieldId: fieldId }, orderBy: { orderIndex: 'asc' } });
      if (children.length > 0) {
        const topLevel = await this.prisma.db.field.findMany({ where: { formDefinitionId: field.formDefinitionId, parentFieldId: null } });
        let nextOrder = topLevel.length === 0 ? 0 : Math.max(...topLevel.map((f) => f.orderIndex)) + 1;
        for (const child of children) {
          await this.prisma.db.field.update({ where: { id: child.id }, data: { parentFieldId: null, orderIndex: nextOrder } });
          nextOrder++;
        }
      }
    }

    await this.prisma.db.field.update({ where: { id: fieldId }, data: { metaIsDeleted: true, metaUpdatedAt: new Date() } });
  }

  // structure is the whole canvas read back in one shot — top-level fields in order, each Section
  // carrying its children in order. A field not mentioned is left untouched (not deleted).
  async reorderFields(formDefinitionId: number, structure: ReorderFieldNode[]) {
    for (let i = 0; i < structure.length; i++) {
      const node = structure[i];
      await this.prisma.db.field.update({ where: { id: node.id }, data: { parentFieldId: null, orderIndex: i } });
      if (node.children) {
        for (let j = 0; j < node.children.length; j++) {
          await this.prisma.db.field.update({ where: { id: node.children[j] }, data: { parentFieldId: node.id, orderIndex: j } });
        }
      }
    }
  }
}
