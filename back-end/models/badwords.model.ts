import mongoose, { Schema, Document } from 'mongoose';
import { DataAdapter, createDataAdapter, DataAdapterConfig } from '../services/data-adapter.service';

export interface IBadWords extends Document {
  language: string;
  swearWords: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const badWordsSchema = new Schema<IBadWords>({
  language: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  swearWords: [{
    type: String,
    required: true,
    trim: true
  }],
}, {
  timestamps: true
});

// Create data adapter using global database configuration
export const BadWordsAdapter = createDataAdapter<IBadWords>('BadWords', badWordsSchema);

// Legacy support
const BadWords = mongoose.model<IBadWords>('BadWords', badWordsSchema);

export default BadWords;