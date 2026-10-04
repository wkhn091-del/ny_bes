import { addon } from './addon';
import { amenity } from './amenity';
import { branch } from './branch';
import { city } from './city';
import { customer } from './customer';
import { legal } from './legal';
import { review } from './review';
import { seo } from './seo';
import { siteSettings } from './siteSettings';
import { space } from './space';

export const contentSchemaTypes = [siteSettings, seo, legal, city, branch, space, amenity, addon];
export const customerSchemaTypes = [customer, review];
