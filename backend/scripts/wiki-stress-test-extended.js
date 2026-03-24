/**
 * Extended Stress Test — 60+ dense documents across 5 domains
 * Target: 1000+ triples to stress-test SST routing, grooming, and retrieval
 *
 * Domains:
 * 1. Solar System (already loaded — ~236 triples)
 * 2. World Geography & Countries (~15 docs)
 * 3. Human Biology (~15 docs)
 * 4. World History (~10 docs)
 * 5. Deep Space & Stars (~10 docs)
 */

import '../db.js';
import * as RavenService from '../services/RavenService.js';
import * as SSTService from '../services/SSTService.js';
import db from '../db.js';

const TEAM_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const SCOPE_ID = 'bbbbbbbb-cccc-dddd-eeee-111111111111';
const USER_ID = 'wiki-test-bot';

const DOCUMENTS = [
  // ═══════════════════════════════════════════════════════════════════════
  // DOMAIN 2: WORLD GEOGRAPHY & COUNTRIES
  // ═══════════════════════════════════════════════════════════════════════

  `Japan is an island country in East Asia with a population of approximately 125 million people as of 2023. Its capital is Tokyo, which is the most populous metropolitan area in the world with over 37 million residents. Japan's GDP is approximately $4.2 trillion, making it the fourth-largest economy in the world. The country consists of 6,852 islands, with the four largest being Honshu, Hokkaido, Kyushu, and Shikoku. Japan's official language is Japanese and its currency is the yen. The country is a constitutional monarchy with Emperor Naruhito as the head of state and a prime minister as head of government.`,

  `Brazil is the largest country in South America and the fifth-largest in the world by both area (8.5 million km²) and population (214 million as of 2023). Its capital is Brasília, though São Paulo is the largest city with 12.3 million residents. Brazil's GDP is approximately $1.9 trillion. The Amazon Rainforest covers about 60% of Brazil's territory and contains approximately 10% of all species on Earth. The official language is Portuguese, making Brazil the largest Portuguese-speaking country in the world. Brazil's major exports include soybeans, iron ore, crude oil, and coffee.`,

  `Germany is a federal republic in Central Europe with a population of 84 million people. Berlin is the capital and largest city with 3.7 million residents. Germany has the largest economy in Europe and the fourth-largest in the world with a GDP of approximately $4.1 trillion. The country is a founding member of the European Union and uses the euro as its currency. Germany is divided into 16 federal states (Bundesländer). Major industries include automotive (BMW, Mercedes-Benz, Volkswagen), chemicals, machinery, and electronics. Germany generates approximately 46% of its electricity from renewable sources as of 2023.`,

  `India is the most populous country in the world with approximately 1.44 billion people as of 2024, surpassing China. Its capital is New Delhi. India has a GDP of approximately $3.7 trillion, making it the fifth-largest economy. The country has 28 states and 8 union territories. India has 22 officially recognized languages, with Hindi and English serving as the official languages of the central government. The Ganges River is 2,525 km long and considered sacred in Hinduism. India's IT sector generates approximately $245 billion in revenue annually, with Bangalore serving as the country's technology hub.`,

  `Australia is both a country and a continent, with a population of approximately 26 million people. Its capital is Canberra, though Sydney is the largest city with 5.3 million residents. Australia's GDP is approximately $1.7 trillion. The country has the world's largest coral reef system, the Great Barrier Reef, stretching over 2,300 km along the northeast coast. Australia is the driest inhabited continent, with the Outback covering approximately 70% of the landmass. Major exports include iron ore, coal, natural gas, gold, and agricultural products. Australia has approximately 140 species of marsupials found nowhere else on Earth.`,

  `Egypt is a transcontinental country spanning the northeast corner of Africa and the Sinai Peninsula in Asia. Its population is approximately 104 million, making it the most populous country in the Arab world. Cairo, the capital, has a metropolitan population of over 21 million. The Nile River, at 6,650 km, is the longest river in Africa and flows through Egypt for about 1,500 km. The Great Pyramid of Giza was built around 2560 BC, stands 146.6 meters tall, and was the tallest man-made structure for over 3,800 years. Egypt's economy relies heavily on tourism, agriculture, natural gas, and Suez Canal revenues (approximately $9.4 billion in 2023).`,

  `Canada is the second-largest country in the world by total area (9.98 million km²) with a population of approximately 40 million people. Ottawa is the capital, while Toronto is the largest city with 2.8 million residents. Canada's GDP is approximately $2.1 trillion. The country has two official languages: English and French. Canada has the world's longest coastline at 243,042 km and shares the longest land border with the United States at 8,891 km. Canada contains approximately 20% of the world's freshwater. Major industries include petroleum, mining, automotive manufacturing, and technology. The Canadian dollar is the currency.`,

  `Nigeria is the most populous country in Africa with approximately 224 million people as of 2024. Lagos is the largest city with over 15 million residents, though Abuja serves as the capital. Nigeria's GDP is approximately $477 billion, making it the largest economy in Africa. The country has over 250 ethnic groups and more than 500 languages. English is the official language. Nigeria is Africa's largest oil producer, with petroleum accounting for approximately 90% of export earnings. The Niger River is the third-longest river in Africa at 4,184 km and flows through western Nigeria before emptying into the Gulf of Guinea.`,

  `Russia is the largest country in the world by area, spanning 17.1 million km² across 11 time zones. Its population is approximately 144 million people. Moscow is the capital and largest city with 12.6 million residents. Russia's GDP is approximately $1.9 trillion. The country possesses the world's largest natural gas reserves and the eighth-largest oil reserves. Lake Baikal in Siberia is the world's deepest lake at 1,642 meters and contains approximately 20% of the world's unfrozen fresh water. The Trans-Siberian Railway is the longest railway line in the world at 9,289 km, connecting Moscow to Vladivostok.`,

  `Mexico is a country in southern North America with a population of approximately 129 million people. Mexico City, the capital, has a metropolitan population of over 21 million, making it one of the largest cities in the Western Hemisphere. Mexico's GDP is approximately $1.3 trillion. The country has 31 states plus Mexico City as a federal entity. Spanish is the official language, though 68 national languages are recognized including Nahuatl and Maya. Mexico is the world's largest producer of avocados and one of the top silver producers. The ancient Maya civilization built pyramids like Chichén Itzá, which was constructed around 600 AD and is one of the New Seven Wonders of the World.`,

  `South Korea, officially the Republic of Korea, has a population of approximately 52 million people. Seoul, the capital, has a metropolitan population of about 26 million. South Korea's GDP is approximately $1.7 trillion, making it the 13th-largest economy. The country is a global leader in electronics, with Samsung and LG being major corporations. K-pop and Korean entertainment have become a global cultural phenomenon, with BTS becoming the best-selling musical act in South Korean history. South Korea has one of the fastest internet speeds in the world, averaging 202 Mbps. The Korean alphabet, Hangul, was created in 1443 by King Sejong the Great.`,

  `The United Kingdom consists of England, Scotland, Wales, and Northern Ireland, with a population of approximately 67 million people. London, the capital, has a metropolitan population of 9.5 million. The UK's GDP is approximately $3.1 trillion, making it the sixth-largest economy. The country uses the pound sterling as its currency. The UK left the European Union on January 31, 2020 (Brexit). The Thames River flows 346 km through southern England. The UK has produced influential figures including Shakespeare, Newton, Darwin, and the Beatles. The National Health Service (NHS), established in 1948, provides free healthcare at the point of use.`,

  // ═══════════════════════════════════════════════════════════════════════
  // DOMAIN 3: HUMAN BIOLOGY
  // ═══════════════════════════════════════════════════════════════════════

  `The human heart is a muscular organ about the size of a closed fist, weighing approximately 250-350 grams. It beats approximately 100,000 times per day, pumping about 7,570 liters of blood. The heart has four chambers: two atria (upper chambers) and two ventricles (lower chambers). The right side pumps blood to the lungs for oxygenation, while the left side pumps oxygenated blood to the rest of the body. The average resting heart rate for adults is 60-100 beats per minute. The aorta is the largest artery in the body, approximately 2.5 cm in diameter. Coronary artery disease is the leading cause of death worldwide, responsible for approximately 9 million deaths annually.`,

  `The human brain weighs approximately 1.4 kg and contains roughly 86 billion neurons. It consumes about 20% of the body's total energy despite comprising only 2% of body weight. The cerebral cortex, the outer layer of the brain, is approximately 2-4 mm thick and contains about 16 billion neurons. The brain is divided into four main lobes: frontal (decision-making, personality), parietal (sensory processing), temporal (memory, hearing), and occipital (vision). The hippocampus is essential for forming new memories and is one of the first areas affected by Alzheimer's disease. Neural signals travel at speeds up to 120 meters per second. The brain reaches 90% of its adult size by age 5.`,

  `The human skeletal system consists of 206 bones in adults, though infants are born with approximately 270 bones that fuse over time. The femur (thigh bone) is the longest and strongest bone, measuring approximately 48 cm in adults. The smallest bone is the stapes in the middle ear, measuring only 3 mm. Bones are composed of approximately 70% minerals (primarily calcium phosphate) and 30% organic material (primarily collagen). The skeleton serves five main functions: support, protection, movement, mineral storage, and blood cell production. Osteoporosis affects approximately 200 million people worldwide and causes bones to become brittle. The spine consists of 33 vertebrae divided into cervical (7), thoracic (12), lumbar (5), sacral (5 fused), and coccygeal (4 fused) regions.`,

  `The human digestive system is approximately 9 meters long from mouth to anus. Digestion begins in the mouth where salivary amylase starts breaking down starches. The stomach produces hydrochloric acid with a pH of 1.5-3.5, strong enough to dissolve metal. The small intestine is approximately 6 meters long and is the primary site of nutrient absorption, with a surface area of approximately 32 square meters due to villi and microvilli. The large intestine (colon) is approximately 1.5 meters long and primarily absorbs water and electrolytes. The liver is the largest internal organ, weighing approximately 1.5 kg, and performs over 500 functions including bile production, detoxification, and protein synthesis. The pancreas produces both digestive enzymes and hormones including insulin and glucagon.`,

  `The human respiratory system brings oxygen into the body and removes carbon dioxide. The lungs contain approximately 300 million alveoli, providing a total surface area of about 70 square meters for gas exchange. An average adult takes 12-20 breaths per minute at rest, inhaling approximately 11,000 liters of air per day. The trachea (windpipe) is approximately 10-12 cm long and 2.5 cm in diameter. The right lung has three lobes while the left lung has two lobes to accommodate the heart. The diaphragm is the primary muscle of respiration. Vital capacity (maximum volume of air that can be exhaled after maximum inhalation) averages about 4.8 liters in males and 3.1 liters in females. Asthma affects approximately 262 million people worldwide.`,

  `The human immune system consists of two main subsystems: innate immunity (non-specific, immediate response) and adaptive immunity (specific, develops over time). White blood cells (leukocytes) are the primary cells of the immune system. There are five main types: neutrophils (50-70% of WBCs), lymphocytes (20-40%), monocytes (2-8%), eosinophils (1-4%), and basophils (<1%). The thymus gland produces T-cells, which are essential for cell-mediated immunity. B-cells produce antibodies (immunoglobulins) that specifically target pathogens. The spleen filters blood and stores platelets and white blood cells. Allergies occur when the immune system overreacts to harmless substances. HIV attacks CD4+ T-cells, progressively weakening the immune system.`,

  `Human blood is composed of approximately 55% plasma and 45% formed elements (cells). An average adult has about 5 liters of blood. Red blood cells (erythrocytes) number approximately 5 million per microliter and carry oxygen using hemoglobin. Each red blood cell lives approximately 120 days before being recycled by the spleen. There are four main blood types: A, B, AB, and O, determined by antigens on red blood cell surfaces. The Rh factor adds positive or negative designation. Type O-negative is the universal donor, while AB-positive is the universal recipient. Platelets (thrombocytes) are essential for blood clotting and number 150,000-400,000 per microliter. Anemia affects approximately 1.62 billion people globally.`,

  `The human muscular system contains approximately 600 skeletal muscles that account for about 40% of total body weight. There are three types of muscle tissue: skeletal (voluntary), cardiac (involuntary, heart only), and smooth (involuntary, internal organs). The gluteus maximus is the largest muscle in the body, while the stapedius in the middle ear is the smallest. The tongue contains 8 muscles. Muscles generate force through the sliding filament mechanism, where actin and myosin filaments slide past each other. Muscles can only pull, not push — they work in antagonistic pairs (e.g., biceps and triceps). ATP (adenosine triphosphate) provides the energy for muscle contraction. Muscle atrophy can begin within 72 hours of immobilization.`,

  `The human endocrine system consists of glands that produce hormones regulating metabolism, growth, reproduction, and mood. The pituitary gland, located at the base of the brain, is often called the "master gland" because it controls other endocrine glands. The thyroid gland produces T3 and T4 hormones that regulate metabolic rate. The adrenal glands produce cortisol (stress hormone), adrenaline (fight-or-flight), and aldosterone (blood pressure regulation). The pancreas produces insulin, which regulates blood sugar — Type 1 diabetes is an autoimmune destruction of insulin-producing beta cells, while Type 2 diabetes involves insulin resistance. Approximately 537 million adults (10.5%) worldwide have diabetes. Melatonin, produced by the pineal gland, regulates the sleep-wake cycle.`,

  `The human nervous system has two main divisions: the central nervous system (brain and spinal cord) and the peripheral nervous system (nerves throughout the body). The spinal cord is approximately 45 cm long and 1 cm in diameter. The peripheral nervous system contains 12 pairs of cranial nerves and 31 pairs of spinal nerves. The autonomic nervous system controls involuntary functions and is divided into sympathetic (fight-or-flight) and parasympathetic (rest-and-digest) divisions. Neurons communicate via synapses using neurotransmitters including dopamine, serotonin, acetylcholine, and GABA. Multiple sclerosis is caused by the immune system attacking the myelin sheath that insulates nerve fibers. Parkinson's disease results from the death of dopamine-producing neurons in the substantia nigra.`,

  `The human skin is the largest organ of the body, covering approximately 1.7 square meters in adults and weighing about 3.6 kg. Skin has three layers: the epidermis (outer layer, 0.05-1.5 mm thick), the dermis (middle layer, 1-4 mm thick), and the hypodermis (subcutaneous fat layer). The epidermis replaces itself every 27 days. Skin contains approximately 300 sweat glands per square centimeter on the palms. Melanin, produced by melanocytes, determines skin color and provides UV protection. The skin's microbiome contains approximately 1,000 species of bacteria. Skin cancer is the most common form of cancer, with melanoma being the most deadly type. Fingerprints are unique to each individual and are formed during fetal development between weeks 10 and 16.`,

  `The human eye can distinguish approximately 10 million different colors. The retina contains two types of photoreceptor cells: approximately 120 million rods (black-and-white, low light) and 6 million cones (color vision). The cornea is responsible for about two-thirds of the eye's total refracting power. The lens changes shape through a process called accommodation to focus on objects at different distances. Normal intraocular pressure ranges from 10-21 mmHg. Myopia (nearsightedness) affects approximately 30% of the world's population and is predicted to affect 50% by 2050. The optic nerve contains approximately 1.2 million nerve fibers. Humans blink approximately 15-20 times per minute, with each blink lasting 100-150 milliseconds.`,

  // ═══════════════════════════════════════════════════════════════════════
  // DOMAIN 4: WORLD HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  `The Roman Empire at its greatest extent under Emperor Trajan in 117 AD covered approximately 5 million km² and had a population of about 70 million people. Rome was founded in 753 BC and the Republic was established in 509 BC. Julius Caesar was assassinated on March 15, 44 BC (the Ides of March). Augustus became the first Roman Emperor in 27 BC. The Colosseum, completed in 80 AD, could seat approximately 50,000 spectators. Latin was the official language and the basis for Romance languages (Italian, French, Spanish, Portuguese, Romanian). The Western Roman Empire fell in 476 AD when Romulus Augustulus was deposed. Roman engineering achievements include aqueducts spanning hundreds of kilometers, concrete that has lasted 2,000 years, and a road network of over 400,000 km.`,

  `World War II lasted from 1939 to 1945 and was the deadliest conflict in human history with an estimated 70-85 million total deaths. The war began when Nazi Germany invaded Poland on September 1, 1939. The Allied Powers included the United States, United Kingdom, Soviet Union, and China. The Axis Powers were Germany, Italy, and Japan. The Battle of Stalingrad (August 1942 - February 1943) resulted in approximately 2 million casualties and was a turning point on the Eastern Front. D-Day, the Allied invasion of Normandy on June 6, 1944, involved over 156,000 troops. The atomic bombs dropped on Hiroshima (August 6, 1945) and Nagasaki (August 9, 1945) killed an estimated 129,000-226,000 people. Germany surrendered on May 8, 1945 (V-E Day), and Japan surrendered on September 2, 1945.`,

  `The Industrial Revolution began in Britain around 1760 and lasted until approximately 1840. James Watt's improved steam engine (patented 1769) was a key innovation that transformed manufacturing and transportation. The spinning jenny (1764) and power loom (1785) revolutionized textile production. The world's first commercial railway, the Liverpool and Manchester Railway, opened in 1830. Britain's population doubled from 6 million to 12 million between 1750 and 1850 due to improved food production and sanitation. Child labor was widespread until the Factory Acts of 1833 and 1844 restricted working hours for children. The Industrial Revolution spread from Britain to Belgium, France, Germany, and the United States by the mid-19th century. Coal production in Britain increased from 5 million tons in 1750 to 200 million tons by 1900.`,

  `Ancient Egypt's civilization lasted approximately 3,000 years, from 3100 BC to 30 BC when it was conquered by Rome. The Old Kingdom (2686-2181 BC) saw the construction of the Great Pyramids. The pharaoh was considered a living god. The Rosetta Stone, discovered in 1799, was key to deciphering Egyptian hieroglyphs — it contained the same text in hieroglyphs, Demotic script, and Ancient Greek. Cleopatra VII was the last active ruler of the Ptolemaic Kingdom, ruling from 51-30 BC. The ancient Egyptians developed papyrus for writing, a 365-day calendar, and advanced mathematics. Mummification was practiced to preserve bodies for the afterlife. The Temple of Karnak in Luxor is the largest religious building ever constructed, covering approximately 100 hectares.`,

  `The Renaissance was a cultural movement that began in Italy in the 14th century and spread across Europe through the 17th century. Florence, under the patronage of the Medici family, was the birthplace of the Renaissance. Leonardo da Vinci (1452-1519) was a polymath who created the Mona Lisa, The Last Supper, and designed flying machines centuries before powered flight. Michelangelo painted the ceiling of the Sistine Chapel between 1508-1512, covering approximately 500 square meters. Johannes Gutenberg's printing press (c. 1440) revolutionized the spread of knowledge — by 1500, an estimated 20 million books had been printed. Nicolaus Copernicus proposed the heliocentric model in 1543, placing the Sun at the center of the Solar System. The Renaissance marked the transition from the medieval period to the modern age.`,

  `The French Revolution began on July 14, 1789, with the storming of the Bastille. The revolution was driven by economic inequality, food shortages, and Enlightenment ideals. King Louis XVI was executed by guillotine on January 21, 1793. The Declaration of the Rights of Man and of the Citizen (1789) established principles of liberty, equality, and popular sovereignty. The Reign of Terror (1793-1794), led by Maximilien Robespierre, resulted in an estimated 16,594 official death sentences. Napoleon Bonaparte seized power in a coup on November 9, 1799, and crowned himself Emperor in 1804. The Napoleonic Code (1804) influenced legal systems across Europe and Latin America. The revolution ended aristocratic privilege and established the foundation for modern democratic governance.`,

  `The Cold War lasted from 1947 to 1991, primarily between the United States (and NATO allies) and the Soviet Union (and Warsaw Pact allies). The Berlin Wall was built on August 13, 1961, dividing East and West Berlin, and fell on November 9, 1989. The Cuban Missile Crisis of October 1962 brought the world closest to nuclear war. The Space Race saw the Soviet Union launch Sputnik (1957) and put Yuri Gagarin in orbit (1961), while the US landed Apollo 11 on the Moon (July 20, 1969). The Korean War (1950-1953) resulted in approximately 2.5 million civilian casualties. The Vietnam War (1955-1975) caused an estimated 3.8 million deaths. The Soviet Union dissolved on December 26, 1991, marking the end of the Cold War.`,

  `The Age of Exploration spanned roughly from the early 15th century to the 17th century. Portugal, under Prince Henry the Navigator, led early maritime exploration along the African coast. Bartholomew Dias rounded the Cape of Good Hope in 1488. Vasco da Gama reached India by sea in 1498, establishing a trade route. Christopher Columbus, sailing for Spain, reached the Americas on October 12, 1492, though he believed he had reached Asia. Ferdinand Magellan's expedition (1519-1522) completed the first circumnavigation of the globe, though Magellan himself was killed in the Philippines in 1521. The Columbian Exchange transferred crops, animals, diseases, and ideas between the Old and New Worlds — potatoes, tomatoes, and tobacco went to Europe, while wheat, horses, and smallpox went to the Americas.`,

  // ═══════════════════════════════════════════════════════════════════════
  // DOMAIN 5: DEEP SPACE, STARS, & COSMOLOGY
  // ═══════════════════════════════════════════════════════════════════════

  `The Sun is a G-type main-sequence star (G2V) located at the center of the Solar System. Its diameter is approximately 1.39 million km (109 times Earth's diameter). The Sun's core temperature is approximately 15 million degrees Celsius, where hydrogen fusion produces helium at a rate of 600 million tons per second. The Sun's surface temperature is approximately 5,500°C. Light from the Sun takes approximately 8 minutes and 20 seconds to reach Earth. The Sun is approximately 4.6 billion years old and is expected to remain on the main sequence for another 5 billion years before expanding into a red giant. The Sun's mass is approximately 1.989 × 10^30 kg, about 333,000 times Earth's mass. Solar flares can release energy equivalent to millions of nuclear bombs.`,

  `Proxima Centauri is the closest star to the Sun at a distance of 4.24 light-years (40.14 trillion km). It is a red dwarf star with a mass approximately 12% of the Sun's mass. Proxima Centauri b, discovered in 2016, is an exoplanet orbiting within the star's habitable zone with a mass approximately 1.17 times Earth's mass. Alpha Centauri is actually a triple star system, with Alpha Centauri A and B forming a binary pair orbited by Proxima Centauri. Betelgeuse, in the constellation Orion, is a red supergiant approximately 700 light-years away with a diameter approximately 1,000 times that of the Sun. Betelgeuse is expected to explode as a supernova within the next 100,000 years.`,

  `The Milky Way galaxy contains approximately 100-400 billion stars and has a diameter of about 100,000 light-years. The Sun is located approximately 26,000 light-years from the galactic center. The Milky Way is a barred spiral galaxy with four major spiral arms. At the center of the Milky Way is Sagittarius A*, a supermassive black hole with a mass approximately 4 million times that of the Sun. The Milky Way is part of the Local Group of galaxies, which contains over 80 galaxies including the Andromeda Galaxy (M31). The Andromeda Galaxy is approximately 2.5 million light-years away and is on a collision course with the Milky Way, expected to merge in approximately 4.5 billion years.`,

  `Black holes are regions of spacetime where gravity is so strong that nothing, not even light, can escape. Stellar black holes form when massive stars (greater than 20 solar masses) collapse at the end of their lives. The event horizon is the boundary beyond which escape is impossible. The smallest known stellar black hole has a mass of approximately 3.8 solar masses. Supermassive black holes, found at the centers of most galaxies, can have masses billions of times that of the Sun. The first image of a black hole (M87*) was captured by the Event Horizon Telescope in April 2019 — the black hole has a mass of 6.5 billion solar masses. Hawking radiation, predicted by Stephen Hawking in 1974, suggests that black holes slowly evaporate over extremely long timescales. The information paradox — whether information that falls into a black hole is truly lost — remains one of the biggest unsolved problems in physics.`,

  `The observable universe has a diameter of approximately 93 billion light-years and contains an estimated 2 trillion galaxies. The universe is approximately 13.8 billion years old, as determined by measurements of the cosmic microwave background (CMB) radiation. The Big Bang theory describes the universe's expansion from an extremely hot, dense initial state. The CMB, discovered in 1965 by Penzias and Wilson, is the afterglow of the Big Bang with a temperature of 2.725 K. Dark matter makes up approximately 27% of the universe's total mass-energy, while dark energy comprises approximately 68%. Ordinary (baryonic) matter makes up only about 5%. The universe is expanding at an accelerating rate, described by the Hubble constant (approximately 70 km/s/Mpc). The cosmic inflation period occurred within the first 10^-36 to 10^-32 seconds after the Big Bang.`,

  `Neutron stars are the collapsed remnants of massive stars (8-20 solar masses) after supernova explosions. A typical neutron star has a mass of 1.4-2 solar masses compressed into a sphere approximately 20 km in diameter. The density of a neutron star is approximately 4 × 10^17 kg/m³ — a teaspoon would weigh about 6 billion tons. Pulsars are rapidly rotating neutron stars that emit beams of electromagnetic radiation. The fastest known pulsar rotates at 716 times per second. When two neutron stars merge, they produce gravitational waves, gold, platinum, and other heavy elements. The first detection of gravitational waves from a neutron star merger (GW170817) was made on August 17, 2017. Magnetars are neutron stars with extremely powerful magnetic fields, approximately 10^15 times stronger than Earth's.`,

  `Exoplanets are planets that orbit stars other than the Sun. As of 2024, over 5,600 exoplanets have been confirmed in more than 4,100 planetary systems. The first confirmed exoplanet orbiting a Sun-like star was 51 Pegasi b, discovered in 1995. The Kepler Space Telescope (2009-2018) discovered over 2,600 confirmed exoplanets. Hot Jupiters are gas giants that orbit very close to their host stars with orbital periods of less than 10 days. Super-Earths are planets with masses between 2-10 times Earth's mass. The TRAPPIST-1 system, 40 light-years away, contains seven Earth-sized planets, with three in the habitable zone. The James Webb Space Telescope can analyze exoplanet atmospheres for biosignatures such as oxygen, methane, and water vapor.`,

  `Supernovae are powerful stellar explosions that can briefly outshine an entire galaxy. Type Ia supernovae occur in binary systems when a white dwarf accretes enough matter to exceed the Chandrasekhar limit of 1.4 solar masses. Type II supernovae result from the core collapse of massive stars. The Crab Nebula is the remnant of a supernova observed by Chinese astronomers in 1054 AD. Supernova 1987A in the Large Magellanic Cloud was the closest observed supernova since the invention of the telescope. Supernovae produce and distribute heavy elements (iron, nickel, cobalt) throughout the galaxy — all elements heavier than iron are created in supernovae or neutron star mergers. The average rate of supernovae in a galaxy like the Milky Way is approximately 1-2 per century. A supernova within 50 light-years of Earth could potentially cause a mass extinction event.`,

  // ═══════════════════════════════════════════════════════════════════════
  // DOMAIN 2 EXTRA: More geography for density
  // ═══════════════════════════════════════════════════════════════════════

  `The Amazon River is the largest river in the world by discharge volume, carrying approximately 209,000 cubic meters per second — roughly 20% of all freshwater that flows into the world's oceans. The Nile River (6,650 km) and Amazon River (6,400 km) compete for the title of longest river. The Sahara Desert is the largest hot desert in the world, covering 9.2 million km² — roughly the size of the United States. Mount Everest, at 8,849 meters, is the highest point on Earth above sea level. The Mariana Trench in the Pacific Ocean is the deepest point on Earth at approximately 10,994 meters. The Pacific Ocean is the largest ocean, covering approximately 165.25 million km² — more than all of Earth's landmass combined.`,

  `The European Union consists of 27 member states following the UK's departure in 2020. The EU has a combined population of approximately 448 million people and a GDP of approximately $18.3 trillion, making it the third-largest economy after the US and China. The euro is used by 20 of the 27 member states (the Eurozone). The Schengen Area allows passport-free travel between 27 European countries (including 4 non-EU members). The European Parliament has 705 members elected by citizens of member states. The EU originated from the European Coal and Steel Community (1951) and the Treaty of Rome (1957). The Maastricht Treaty of 1992 formally established the European Union.`,

  `China is the most populous country in Asia with approximately 1.41 billion people as of 2024 (recently surpassed by India). Beijing is the capital, while Shanghai is the largest city with 24.9 million residents. China's GDP is approximately $17.7 trillion, the second-largest in the world. The Great Wall of China stretches over 21,196 km, with construction spanning from the 7th century BC to the 17th century AD. China has the world's largest high-speed rail network at over 42,000 km. Mandarin Chinese is the most spoken language in the world by number of native speakers (approximately 920 million). China is the world's largest manufacturer, producing approximately 28% of global manufacturing output.`,

  // ═══════════════════════════════════════════════════════════════════════
  // CROSS-DOMAIN CONNECTIONS (tests multi-hop across domains)
  // ═══════════════════════════════════════════════════════════════════════

  `The human body contains approximately 0.2 mg of gold, mostly in the blood. Gold is produced exclusively in supernovae and neutron star mergers — every gold atom on Earth was created in a stellar explosion billions of years ago. South Africa is the world's fifth-largest gold producer, extracting approximately 100 metric tons annually. The price of gold reached a record high of approximately $2,135 per ounce in December 2023. The human body also contains trace amounts of other elements produced in stars, including iron (approximately 4 grams in the body, primarily in hemoglobin) and calcium (approximately 1 kg, primarily in bones). As Carl Sagan famously stated, we are literally made of "star stuff."`,

  `The Suez Canal in Egypt connects the Mediterranean Sea to the Red Sea and is approximately 193 km long. It was opened in 1869 and handles approximately 12-15% of global trade. Similarly, the Panama Canal connects the Atlantic and Pacific Oceans and is 82 km long, opened in 1914. Japan imports approximately 90% of its energy needs, much of it transported through the Strait of Malacca. The International Space Station orbits Earth at approximately 408 km altitude and passes over approximately 90% of Earth's populated areas. Astronauts aboard the ISS experience 16 sunrises and sunsets every 24 hours due to their orbital speed of 27,600 km/h.`,
];

async function run() {
  console.log(`\n🧪 Extended Stress Test`);
  console.log(`   Team: ${TEAM_ID}`);
  console.log(`   Documents: ${DOCUMENTS.length}`);
  console.log(`   Scope: ${SCOPE_ID}\n`);

  // Check current state
  const [tc, cc] = await Promise.all([
    db.query('SELECT COUNT(*) as c FROM triples WHERE team_id = $1 AND status = $2', [TEAM_ID, 'active']),
    db.query('SELECT COUNT(*) as c FROM concepts WHERE team_id = $1', [TEAM_ID]),
  ]);
  console.log(`Starting state: ${tc.rows[0].c} triples, ${cc.rows[0].c} concepts\n`);

  let totalNew = 0;
  let totalUpdated = 0;
  let errors = 0;

  for (let i = 0; i < DOCUMENTS.length; i++) {
    const doc = DOCUMENTS[i];
    const preview = doc.substring(0, 55).replace(/\n/g, ' ');
    console.log(`[${i + 1}/${DOCUMENTS.length}] "${preview}..."`);

    try {
      const result = await RavenService.previewRemember(SCOPE_ID, USER_ID, doc);
      const tripleCount = result.extractedTriples?.length || 0;

      if (tripleCount > 0) {
        const confirmed = await RavenService.confirmRemember(result.previewId, [], USER_ID);
        const created = confirmed.triplesCreated?.length || 0;
        const updated = confirmed.triplesUpdated?.length || 0;
        totalNew += created;
        totalUpdated += updated;
        console.log(`  → ${created} new, ${updated} updated (${tripleCount} extracted)`);
      } else {
        console.log(`  → 0 triples extracted`);
        errors++;
      }
    } catch (err) {
      console.error(`  ERROR: ${err.message.substring(0, 100)}`);
      errors++;
    }

    // Rate limit protection
    await new Promise(r => setTimeout(r, 1500));
  }

  // Final counts
  const [ftc, fcc, fst] = await Promise.all([
    db.query('SELECT COUNT(*) as c FROM triples WHERE team_id = $1 AND status = $2', [TEAM_ID, 'active']),
    db.query('SELECT COUNT(*) as c FROM concepts WHERE team_id = $1', [TEAM_ID]),
    db.query('SELECT COUNT(*) as c FROM sst_nodes WHERE team_id = $1', [TEAM_ID]),
  ]);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 EXTENDED STRESS TEST COMPLETE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Documents processed: ${DOCUMENTS.length}`);
  console.log(`New triples: ${totalNew}`);
  console.log(`Updated triples: ${totalUpdated}`);
  console.log(`Extraction errors: ${errors}`);
  console.log(`\nFinal state:`);
  console.log(`  Active triples: ${ftc.rows[0].c}`);
  console.log(`  Concepts: ${fcc.rows[0].c}`);
  console.log(`  SST nodes: ${fst.rows[0].c}`);

  // Quick retrieval tests across domains
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 CROSS-DOMAIN RETRIEVAL TESTS`);
  console.log(`${'='.repeat(60)}`);

  const testQueries = [
    // Within-domain
    { q: 'What is the population of Japan?', domain: 'Geography' },
    { q: 'How many chambers does the human heart have?', domain: 'Biology' },
    { q: 'When did World War II end?', domain: 'History' },
    { q: 'What is a black hole?', domain: 'Space' },
    // Cross-domain
    { q: 'Where does gold come from?', domain: 'Cross (Biology+Space+Geography)' },
    { q: 'What connects the Mediterranean to the Red Sea?', domain: 'Cross (Geography+Trade)' },
    // Ambiguous (tests SST routing)
    { q: 'What is the largest?', domain: 'Ambiguous' },
    { q: 'How old is it?', domain: 'Ambiguous (needs context)' },
    // Paraphrased
    { q: 'Tell me about the deadliest war', domain: 'History (paraphrased)' },
    { q: 'Which country makes the most stuff?', domain: 'Geography (paraphrased)' },
    // Unanswerable
    { q: 'What is the recipe for chocolate cake?', domain: 'Unanswerable' },
    { q: 'Who won the 2024 Super Bowl?', domain: 'Unanswerable' },
  ];

  for (const { q, domain } of testQueries) {
    console.log(`\n[${domain}] "${q}"`);
    try {
      const answer = await RavenService.ask(SCOPE_ID, USER_ID, q);
      const conf = answer.confidence != null ? Math.round(answer.confidence * 100) : '?';
      console.log(`  → ${conf}% | ${answer.answer.substring(0, 180).replace(/\n/g, ' ')}${answer.answer.length > 180 ? '...' : ''}`);
    } catch (err) {
      console.log(`  → ERROR: ${err.message.substring(0, 100)}`);
    }
  }

  await db.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
