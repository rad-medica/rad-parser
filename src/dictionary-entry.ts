/**
 * Dictionary Entry Point
 * Used for building the standalone dictionary bundle.
 * Importing this bundle will automatically register the dictionary.
 */
import { dicomDictionary as data } from './utils/dictionary-data';
import { registerDictionary } from './utils/dictionary';

// Register the dictionary data
registerDictionary(data);

export { data as dicomDictionary };
export * from './utils/dictionary';
