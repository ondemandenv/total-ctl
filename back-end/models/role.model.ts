import mongoose, { Schema, Document } from 'mongoose';
import { DataAdapter, createDataAdapter, DataAdapterConfig } from '../services/data-adapter.service';

export interface IRole extends Document {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const roleSchema = new Schema<IRole>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  permissions: [{
    type: String,
    required: true
  }],
}, {
  timestamps: true
});

// Create data adapter using global database configuration
export const RoleAdapter = createDataAdapter<IRole>('Role', roleSchema);

// Legacy support
const Role = mongoose.model<IRole>('Role', roleSchema);

export default Role;