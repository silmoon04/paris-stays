export function compactStay(stay, photos) {
  const review = stay.enrichment?.photoReview;
  const selected = review?.bestPhotoIndex;
  const index =
    selected !== null &&
    review?.viewedPhotoIndices.includes(selected) &&
    photos[selected]
      ? selected
      : 0;
  return {
    ...stay,
    photoCount: photos.length,
    photos: photos.length ? [photos[index]] : [],
  };
}
