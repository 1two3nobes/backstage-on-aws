
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { Config } from './types';

const file = readFileSync('./configs/env.yaml', 'utf8');
const config = parse(file) as Config;
const { common, stages } = config;

export {
  common, stages
}