import mongoose, { Schema, Document } from 'mongoose';
import { DataAdapter, createDataAdapter, DataAdapterConfig } from '../services/data-adapter.service';

export interface IHologram extends Document {
  _id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  userId: string;
  isActive: boolean;
  metadata?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IHologramCreate {
  name: string;
  url: string;
  thumbnailUrl?: string;
  userId: string;
  metadata?: any;
}

const hologramSchema = new Schema<IHologram>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  thumbnailUrl: {
    type: String,
    trim: true
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
}, {
  timestamps: true
});

// Create data adapter using global database configuration
export const HologramAdapter = createDataAdapter<IHologram>('Hologram', hologramSchema);

// Legacy support
const Hologram = mongoose.model<IHologram>('Hologram', hologramSchema);

export default Hologram;