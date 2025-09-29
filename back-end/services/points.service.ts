import Points, { type IPoints } from "../models/points.model";
import { promises as fs } from 'fs';
import path from 'path';

export class PointsService {
  public async getPointsByRegion(region: string): Promise<IPoints | null> {
    return await Points.findOne({ region });
  }

  public async createOrUpdatePointsForRegion(region: string, pointsData: Partial<IPoints>): Promise<IPoints> {
    return await Points.findOneAndUpdate(
      { region },
      { ...pointsData, region },
      { new: true, upsert: true }
    );
  }

  public async getPointsForRegionAsJsonFile(region: string): Promise<Buffer> {
    const pointsConfig = await Points.findOne({ region });
    if (!pointsConfig) {
      throw new Error(`Points configuration not found for region ${region}`);
    }

    const jsonContent = JSON.stringify(pointsConfig, null, 2);
    return Buffer.from(jsonContent);
  }

  public async deletePoints(region: string): Promise<IPoints | null> {
      return await Points.findOneAndDelete({ region });
  }
}
