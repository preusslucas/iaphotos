-- Foto do depoimento na landing.
--
-- Nula por padrao: as figuras que ja existem continuam desenhando as iniciais
-- num circulo, que e o que a landing fazia antes deste campo. Nenhuma linha
-- precisa ser preenchida para o deploy passar.
ALTER TABLE "Testimonial" ADD COLUMN "photo" TEXT;
