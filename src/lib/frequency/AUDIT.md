# English–Spanish frequency-list audit

## Scope and provenance

All 1,001 entries from the supplied `FrequencyList1k-en-es - Sheet1.csv` were reviewed in an AI-assisted linguistic audit. Review covered meaning, part of speech, tense, number, accents, register, idioms, and common Latin American Spanish variants. A separate quality-control pass checked accepted alternatives and contextual equivalence.

The English strings, one-based ranks, and frequency order remain unchanged. The Spanish translations are now curated study data, not a verbatim copy of the original machine-translation pass. This is not an externally dictionary-verified or exhaustive lexicographic reference; the source provided no example sentences or original corpus context.

## Results

- **1,001 cards reviewed**; no source entries removed or reordered.
- **222 primary entries revised**, including **13 capitalization-only changes**. Other revisions include genuine translation errors, better default senses, grammatical forms, and punctuation.
- **752 cards** have at least one accepted alternative, with **1,353 alternative answers** in total.
- Per-word usage notes are intentionally omitted from the cards and vocabulary data.
- The full answer pool has **1,876 distinct Spanish spellings**, including primary and alternative answers. Duplicate suggestions are collapsed; distinct accented spellings remain visible.

Valid original senses were not automatically discarded when the primary answer changed. For example, `saw` defaults to `vio` but accepts `sierra`; `calling` defaults to `llamando` but accepts `vocación`; `makes` defaults to `hace` but accepts the noun sense `marcas`. Likewise, `please` accepts both polite-request `por favor` and verb senses `complacer` / `agradar`.

## Data and grading policy

Each object in `words.json` has:

- `rank` and `english`: unchanged source identity and order.
- `spanish`: one concise default answer, generally prioritizing a common conversational use.
- Optional `alternatives`: separate acceptable Spanish answers, not a slash-separated string students must reproduce.


Search includes all primary and alternative answers. Grading accepts any reviewed answer for that card after the existing accent, case, and whitespace normalization; fuzzy queries themselves are not graded as exact answers. Alternatives are representative, not every possible synonym, gender form, subject conjugation, or specialized sense.

## Context-sensitive entries

- **Auxiliaries:** `will`, `would`, and `shall` do not have universal standalone Spanish equivalents. `would` uses `-ría` as a conditional grammar cue, not as an independent Spanish word; `solía` and `iba a` are contextual alternatives. `will` and `shall` require a subject and main verb to choose a complete Spanish phrase.
- **Possible contraction fragments:** `didn`, `isn`, `wasn`, `wouldn`, `couldn`, `aren`, `ain`, and `hasn` remain unchanged on the English side. Their readings as incomplete negative contractions are provisional; they are not standard standalone English words.
- **Ambiguous real words:** `won` retains a genuine form of `win`; `haven` retains `refugio`. Possible fragments of `won’t` / `haven’t` cannot be confirmed from the list alone.
- **Other source artifacts:** `em`, `lt`, and `i-i` are provisionally interpreted as a clipped pronoun, abbreviation, or stutter. A modern person's name such as George is not automatically renamed Jorge.
- **Idioms and place names:** words such as `sake`, `American`, and `America` still need sentence or regional context.
- **Strong language:** profanity and informal speech are retained. No maturity filtering was added.

Sentence-based examples or the original corpus would be needed to resolve these ambiguities definitively. The deck remains English-first in either interface language.

## Regression checks

`tests/frequency.test.ts` verifies the original English/rank order, complete deck coverage, valid and unique per-card answers, the absence of per-word notes, important translation corrections, preserved legitimate alternative meanings, global search coverage, and exact alternative grading. `tests/frequency-practice.test.ts` also checks that a correct alternative does not enter the missed-word queue.

SHA-256 of the original `rank,english` rows joined with LF separators:

```text
d5858682b2bc42e2b1e3d06a8c680d2c7e1878f0fd9d81c1ed70f0bb8165f0a9
```

## Primary-answer change log

The table below records every primary-answer revision against the supplied CSV. It does not list the newly added alternatives; those live alongside each word in `words.json`.

| Rank | English | Original Spanish | Reviewed primary |
| --- | --- | --- | --- |
| 5 | `a` | `a` | `un` |
| 6 | `it` | `el o la (objeto)` | `eso` |
| 14 | `me` | `a mí` | `me` |
| 15 | `this` | `este` | `esto` |
| 19 | `on` | `en` | `sobre` |
| 21 | `your` | `su` | `tu` |
| 24 | `no` | `No` | `no` |
| 34 | `just` | `justo` | `solo` |
| 35 | `there` | `allá` | `allí` |
| 38 | `like` | `como` | `gustar` |
| 43 | `right` | `bien` | `correcto` |
| 45 | `about` | `acerca de` | `sobre` |
| 48 | `him` | `a él` | `lo` |
| 50 | `oh` | `Vaya` | `oh` |
| 53 | `well` | `Bueno` | `bien` |
| 54 | `her` | `su` | `la` |
| 57 | `will` | `voluntad` | `ir a` |
| 59 | `want` | `desear` | `querer` |
| 64 | `good` | `bien` | `bueno` |
| 65 | `who` | `quien` | `quién` |
| 70 | `yes` | `Sí` | `sí` |
| 71 | `when` | `cuando` | `cuándo` |
| 75 | `okay` | `bueno` | `está bien` |
| 78 | `us` | `a nosotros` | `nos` |
| 79 | `would` | `quería` | `-ría` |
| 80 | `them` | `a ellos` | `los` |
| 83 | `take` | `llevar` | `tomar` |
| 91 | `really` | `en realidad` | `realmente` |
| 93 | `some` | `alguno` | `algunos` |
| 95 | `hey` | `ey` | `oye` |
| 99 | `need` | `necesidad` | `necesitar` |
| 111 | `over` | `encima` | `encima de` |
| 118 | `said` | `dicho` | `dijo` |
| 119 | `sorry` | `Lo siento` | `lo siento` |
| 132 | `help` | `ayuda` | `ayudar` |
| 140 | `sir` | `Señor` | `señor` |
| 145 | `uh` | `oh` | `eh` |
| 152 | `stop` | `detener` | `parar` |
| 155 | `won` | `ganado` | `ganó` |
| 159 | `thought` | `pensamiento` | `pensó` |
| 160 | `home` | `hogar` | `casa` |
| 164 | `those` | `aquellos` | `esos` |
| 169 | `mr.` | `señor.` | `señor` |
| 176 | `leave` | `dejar` | `irse` |
| 184 | `guys` | `tipo` | `chicos` |
| 186 | `guy` | `chico` | `tipo` |
| 187 | `made` | `hecho` | `hizo` |
| 189 | `isn` | `no` | `no es` |
| 190 | `which` | `cual` | `cuál` |
| 192 | `lot` | `lote` | `montón` |
| 194 | `hello` | `Hola` | `hola` |
| 195 | `nice` | `lindo` | `agradable` |
| 201 | `wanted` | `buscado` | `quería` |
| 202 | `kind` | `amable` | `tipo` |
| 203 | `coming` | `próximo` | `viniendo` |
| 206 | `ok` | `OK` | `está bien` |
| 208 | `being` | `ser` | `siendo` |
| 210 | `stay` | `permanecer` | `quedarse` |
| 227 | `hear` | `escuchar` | `oír` |
| 232 | `show` | `espectáculo` | `mostrar` |
| 233 | `else` | `demás` | `más` |
| 238 | `getting` | `conseguir` | `consiguiendo` |
| 240 | `car` | `auto` | `carro` |
| 246 | `hi` | `Hola` | `hola` |
| 250 | `wasn` | `no` | `no era` |
| 261 | `saw` | `sierra` | `vio` |
| 270 | `most` | `mayoría` | `la mayoría` |
| 274 | `actually` | `de hecho` | `en realidad` |
| 275 | `huh` | `eh` | `¿eh?` |
| 278 | `heard` | `escuchó` | `oyó` |
| 282 | `called` | `llamado` | `llamó` |
| 283 | `used` | `usado` | `usó` |
| 289 | `such` | `semejante` | `tal` |
| 290 | `fuck` | `Mierda` | `joder` |
| 294 | `bit` | `poco` | `un poco` |
| 306 | `guess` | `adivinar` | `suponer` |
| 318 | `myself` | `mí mismo` | `yo mismo` |
| 320 | `gone` | `desaparecido` | `ido` |
| 321 | `um` | `um` | `eh` |
| 323 | `saying` | `dicho` | `diciendo` |
| 326 | `looks` | `aspecto` | `parece` |
| 328 | `fucking` | `maldito` | `jodido` |
| 332 | `gotta` | `tengo que` | `tener que` |
| 333 | `ago` | `atrás` | `hace` |
| 335 | `anyone` | `alguien` | `cualquiera` |
| 336 | `killed` | `delicado` | `mató` |
| 342 | `excuse` | `disculpar` | `excusa` |
| 343 | `turn` | `doblar` | `girar` |
| 348 | `TRUE` | `VERDADERO` | `verdadero` |
| 365 | `thinking` | `pensamiento` | `pensando` |
| 368 | `working` | `laboral` | `trabajando` |
| 374 | `stuff` | `cosa` | `cosas` |
| 392 | `its` | `es` | `su` |
| 393 | `whatever` | `lo que` | `lo que sea` |
| 396 | `aren` | `no` | `no son` |
| 401 | `check` | `controlar` | `revisar` |
| 406 | `means` | `medio` | `significa` |
| 409 | `makes` | `marcas` | `hace` |
| 418 | `dear` | `estimado` | `querido` |
| 423 | `ain` | `ain` | `no` |
| 425 | `fun` | `divertido` | `diversión` |
| 428 | `comes` | `llega` | `viene` |
| 435 | `least` | `el menos` | `menos` |
| 436 | `waiting` | `espera` | `esperando` |
| 464 | `women` | `mujer` | `mujeres` |
| 476 | `trouble` | `problema` | `problemas` |
| 481 | `town` | `ciudad` | `pueblo` |
| 482 | `trust` | `confianza` | `confiar` |
| 483 | `met` | `conocí` | `conoció` |
| 490 | `wow` | `Guau` | `guau` |
| 492 | `half` | `medio` | `mitad` |
| 493 | `died` | `fallecido` | `murió` |
| 494 | `cool` | `Frío` | `genial` |
| 495 | `free` | `gratis` | `libre` |
| 498 | `power` | `fuerza` | `poder` |
| 499 | `whoa` | `¡Guau!` | `¡epa!` |
| 502 | `telling` | `narración` | `diciendo` |
| 503 | `honey` | `Miel` | `miel` |
| 508 | `gun` | `pistola` | `arma de fuego` |
| 518 | `save` | `ahorrar` | `salvar` |
| 523 | `food` | `alimento` | `comida` |
| 526 | `needs` | `necesidades` | `necesita` |
| 531 | `em` | `ellos` | `los` |
| 533 | `lord` | `caballero` | `señor` |
| 537 | `funny` | `divertido` | `gracioso` |
| 539 | `mrs.` | `señora.` | `señora` |
| 551 | `sort` | `clasificar` | `tipo` |
| 552 | `leaving` | `partida` | `saliendo` |
| 553 | `running` | `correr` | `corriendo` |
| 566 | `lives` | `vidas` | `vive` |
| 572 | `serious` | `grave` | `serio` |
| 585 | `top` | `arriba` | `parte superior` |
| 588 | `cannot` | `no puedo` | `no puede` |
| 593 | `hmm` | `Mmm` | `mmm` |
| 609 | `laughing` | `reír` | `riendo` |
| 631 | `rather` | `bastante` | `más bien` |
| 636 | `bet` | `apuesta` | `apostar` |
| 637 | `longer` | `más extenso` | `más largo` |
| 638 | `calling` | `vocación` | `llamando` |
| 640 | `quiet` | `tranquilo` | `silencioso` |
| 644 | `beat` | `derrotar` | `golpear` |
| 647 | `return` | `devolver` | `regresar` |
| 651 | `seeing` | `vidente` | `viendo` |
| 654 | `ooh` | `Oh` | `oh` |
| 655 | `fault` | `falla` | `culpa` |
| 656 | `straight` | `derecho` | `recto` |
| 657 | `takes` | `acepta` | `toma` |
| 663 | `road` | `camino` | `carretera` |
| 666 | `turned` | `transformado` | `giró` |
| 682 | `speaking` | `discurso` | `hablando` |
| 684 | `darling` | `querida` | `cariño` |
| 685 | `dude` | `dudar` | `tipo` |
| 686 | `giving` | `donación` | `dando` |
| 690 | `moving` | `emocionante` | `moviendo` |
| 691 | `figure` | `cifra` | `figura` |
| 697 | `works` | `obras` | `funciona` |
| 698 | `act` | `acto` | `actuar` |
| 699 | `needed` | `necesario` | `necesitó` |
| 707 | `happening` | `acontecimiento` | `pasando` |
| 713 | `kidding` | `bromear` | `bromeando` |
| 714 | `decided` | `decidido` | `decidió` |
| 715 | `pass` | `aprobar` | `pasar` |
| 719 | `kept` | `conservó` | `mantuvo` |
| 725 | `court` | `corte` | `tribunal` |
| 727 | `finish` | `finalizar` | `terminar` |
| 740 | `ride` | `conducir` | `montar` |
| 745 | `tv` | `televisor` | `televisión` |
| 750 | `instead` | `en cambio` | `en su lugar` |
| 759 | `seven` | `Siete` | `siete` |
| 760 | `wear` | `tener puesto` | `llevar puesto` |
| 765 | `hasn` | `no` | `no ha` |
| 770 | `george` | `Jorge` | `George` |
| 775 | `broke` | `en bancarrota` | `sin dinero` |
| 790 | `buddy` | `compañero` | `amigo` |
| 791 | `paid` | `pagado` | `pagó` |
| 806 | `finished` | `finalizado` | `terminó` |
| 820 | `sitting` | `sesión` | `sentado` |
| 821 | `marriage` | `casamiento` | `matrimonio` |
| 834 | `american` | `americano` | `estadounidense` |
| 837 | `charge` | `cargar` | `cobrar` |
| 841 | `idiot` | `estúpido` | `idiota` |
| 851 | `wearing` | `agotador` | `llevando puesto` |
| 852 | `crying` | `llanto` | `llorando` |
| 863 | `agree` | `aceptar` | `estar de acuerdo` |
| 871 | `smart` | `elegante` | `inteligente` |
| 874 | `stopped` | `interrumpido` | `se detuvo` |
| 880 | `america` | `América` | `Estados Unidos` |
| 886 | `bastard` | `bastardo` | `cabrón` |
| 890 | `screaming` | `estridente` | `gritando` |
| 895 | `fighting` | `lucha` | `peleando` |
| 898 | `blow` | `explotar` | `soplar` |
| 900 | `missed` | `omitido` | `perdió` |
| 902 | `killing` | `asesinato` | `matando` |
| 904 | `saved` | `guardado` | `salvó` |
| 910 | `feels` | `sentimientos` | `siente` |
| 913 | `cell` | `celúla` | `célula` |
| 914 | `drunk` | `ebrio` | `borracho` |
| 917 | `within` | `dentro` | `dentro de` |
| 925 | `starting` | `a partir de` | `comenzando` |
| 927 | `spent` | `gastado` | `gastó` |
| 930 | `visit` | `visita` | `visitar` |
| 935 | `dare` | `atrevimiento` | `atreverse` |
| 937 | `moved` | `emocionado` | `se movió` |
| 938 | `prove` | `probar` | `demostrar` |
| 940 | `wall` | `muro` | `pared` |
| 942 | `i-i` | `yo-yo` | `yo` |
| 946 | `lt` | `lt` | `teniente` |
| 953 | `college` | `colega` | `universidad` |
| 957 | `became` | `convertirse` | `se convirtió` |
| 958 | `lived` | `vivido` | `vivió` |
| 961 | `neither` | `ni` | `ninguno de los dos` |
| 968 | `sake` | `beneficio` | `bien` |
| 972 | `apartment` | `departamento` | `apartamento` |
| 973 | `upset` | `decepcionado` | `molesto` |
| 975 | `liked` | `apreciado` | `le gustó` |
| 977 | `evil` | `demonio` | `malvado` |
| 984 | `store` | `almacenar` | `tienda` |
| 985 | `jail` | `celda` | `cárcel` |
| 986 | `likes` | `gustos` | `le gusta` |
| 992 | `shop` | `comercio` | `tienda` |
| 994 | `congratulations` | `Felicidades` | `felicidades` |
| 997 | `quit` | `abandonar` | `dejar` |
