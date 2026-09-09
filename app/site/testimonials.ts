// Real Google reviews, pulled verbatim from the old Jobber-hosted site
// (goldenturfcare.jobbersites.com) at Ryan's request -- he wanted the
// actual customer wording on the new site, not paraphrased/invented
// testimonials. The star rating and review count are also real, sourced
// from the same site's Google rating widget. Shared between the
// homepage and /reviews so both stay in sync with one edit if Ryan ever
// wants to swap a quote out.
export type Testimonial = {
  quote: string;
  name: string;
};

export const GOOGLE_RATING = 5.0;
export const GOOGLE_REVIEW_COUNT = 58;

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "We have two dogs and have been fighting the smell for a while now with our turf. Tyson with Golden Turf Care came out and did an incredible job, it looks and smells amazing. Looking forward to having them come out quarterly!",
    name: "Kaleen Carter",
  },
  {
    quote:
      "Golden turf came out to clean our turf, and they did an AMAZING JOB! I HIGHLY RECOMMEND THEM!! Check out before and after photos, it got bad as we had a 125lb tortoise.",
    name: "Debbie Edwards",
  },
  {
    quote:
      "Golden Turf Care is terrific! They handled the care of our turf so well. Did a wonderful job looking at tough spots with stains and removing them. Set ourselves up for recurring service as a result. Can't beat the price either. Fantastic company!",
    name: "Nate Benham",
  },
];
