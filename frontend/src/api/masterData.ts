import { api } from './client';

export interface MasterUnit {
  id: number;
  name: string;
}

export interface MasterArea {
  id: number;
  name: string;
  code: string;
  units: MasterUnit[];
}

export interface MasterPlant {
  id: number;
  name: string;
  code: string;
  areas: MasterArea[];
}

export async function getMasterPlants() {
  const { data } = await api.get<MasterPlant[]>('/api/master/plants');
  return data;
}
