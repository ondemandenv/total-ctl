import mongoose, { Schema, Document } from 'mongoose';
import { DataAdapter, createDataAdapter, DataAdapterConfig } from '../services/data-adapter.service';

export interface IPoints extends Document {
  userId: string;
  points: number;
  reason: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const pointsSchema = new Schema<IPoints>({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  points: {
    type: Number,
    required: true,
    default: 0
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
}, {
  timestamps: true
});

// Create data adapter using global database configuration
export const PointsAdapter = createDataAdapter<IPoints>('Points', pointsSchema);

// Legacy support
const Points = mongoose.model<IPoints>('Points', pointsSchema);

export default Points;