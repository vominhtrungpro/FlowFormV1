import { Controller, Get, InternalServerErrorException, Query } from '@nestjs/common';
import { findLimsGrade } from './lims-grade-data';

// Ports LimsLookupController.cs — simulates an external LIMS system for the ExternalLookup field
// type. The artificial delay keeps the frontend's "looking up…" loading state demonstrable, same
// as the old app's `await Task.Delay(500)`.
@Controller('api/lims')
export class LimsLookupController {
  @Get('lookup')
  async lookup(@Query('code') code: string, @Query('simulateError') simulateError?: string) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (simulateError === 'true') {
      throw new InternalServerErrorException({ error: 'LIMS system error (simulated).' });
    }

    const grade = findLimsGrade(code ?? '');
    if (!grade) return { found: false, code };
    return { found: true, code: grade.code, description: grade.description, specs: grade.specs };
  }
}
