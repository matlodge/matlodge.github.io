# Matlodge

Matlodge is a database and web explorer for optical properties of phase-change materials (PCMs). Matlodge will focus on the refractive index of a material, defined as a dataset with lambda, n and k columns (*n + ki* form a complex number).

A pcm is defined by its formulation (e.g. Sb2S3). A pcm has different properties depending on its phase: amorphous or crystalline. Each phase will have a dataset with the same three columns.

There can be several samples of the same material. In the database, they are numbered, and the pcm formulation and number can be combined with an underscore to form a unique id (e.g. Sb2S3_1). Each sample comes from a source, which is associated with a research paper. From a source we know the source id (a DOI), and the source title.

We can have extra data from each sample:

- The data extraction method, which refers to the way it was imported into matlodge, so not related to the sample itself. For instance, data could be available from the source as supplementary material; it could have been digitized from a graphical plot because no other means were available; among others.
- Refractive index measurement method.
- Ellipsometry fitting model (e.g. Tauc-Lorentz, Cody-Lorentz), with model parameters available or not.
- Deposition method of the sample
- Thickness of the pcm
- Capping layer