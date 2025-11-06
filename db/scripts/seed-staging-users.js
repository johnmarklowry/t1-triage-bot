/**
 * db/seed-staging-users.js
 * Seed staging database with test users
 */
const { UsersRepository, SprintsRepository, CurrentStateRepository } = require('../repository');

/**
 * Seed users into the staging database
 */
async function seedUsers() {
  try {
    console.log('🌱 Seeding staging database with users...');
    
    // Users to add
    const users = [
      {
        slackId: 'U061JQ7LP3D',
        name: 'Nate Lubeck',
        disciplines: ['account', 'producer', 'po']
      },
      {
        slackId: 'U0613KG42QZ',
        name: 'John Mark Lawry',
        disciplines: ['uiEng', 'beEng']
      }
    ];
    
    // Add each user to their disciplines
    for (const user of users) {
      console.log(`\n👤 Adding ${user.name}...`);
      
      for (const discipline of user.disciplines) {
        try {
          const userId = await UsersRepository.addUser(
            user.slackId,
            user.name,
            discipline,
            'seed-staging'
          );
          console.log(`  ✅ Added to ${discipline} (ID: ${userId})`);
        } catch (error) {
          console.error(`  ❌ Error adding to ${discipline}:`, error.message);
        }
      }
    }
    
    // Verify users were added
    console.log('\n📊 Verifying users in database...');
    const disciplines = await UsersRepository.getDisciplines();
    
    console.log('\n📋 Current disciplines in database:');
    for (const [discipline, users] of Object.entries(disciplines)) {
      console.log(`\n${discipline}:`);
      users.forEach(user => {
        console.log(`  - ${user.name} (${user.slackId})`);
      });
    }
    
    console.log('\n✅ Staging database seeded successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding staging database:', error);
    throw error;
  }
}

/**
 * Create sample sprints for testing
 */
async function seedSprints() {
  try {
    console.log('\n📅 Creating sample sprints...');
    
    const today = new Date();
    const sprintDates = [];
    
    // Create 6 sprints (3 months of bi-weekly sprints)
    for (let i = 0; i < 6; i++) {
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + (i * 14));
      
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 13);
      
      sprintDates.push({
        sprintIndex: i + 1,
        sprintName: `Sprint ${i + 1}`,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });
    }
    
    for (const sprint of sprintDates) {
      try {
        await SprintsRepository.addSprint(
          sprint.sprintName,
          sprint.startDate,
          sprint.endDate,
          sprint.sprintIndex,
          'seed-staging'
        );
        console.log(`  ✅ Created ${sprint.sprintName} (Index: ${sprint.sprintIndex})`);
      } catch (error) {
        console.error(`  ❌ Error creating sprint:`, error.message);
      }
    }
    
    console.log('\n✅ Sample sprints created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating sprints:', error);
    throw error;
  }
}

/**
 * Set initial current state
 */
async function setInitialState() {
  try {
    console.log('\n🔄 Setting initial current state...');
    
    const initialState = {
      sprintIndex: 1,
      account: 'U061JQ7LP3D',
      producer: 'U061JQ7LP3D',
      po: 'U061JQ7LP3D',
      uiEng: 'U0613KG42QZ',
      beEng: 'U0613KG42QZ'
    };
    
    await CurrentStateRepository.update(initialState, 'seed-staging');
    console.log('✅ Initial current state set successfully!');
    
  } catch (error) {
    console.error('❌ Error setting initial state:', error);
    throw error;
  }
}

/**
 * Main function to seed the database
 */
async function main() {
  try {
    console.log('🚀 Starting staging database seed process...\n');
    
    await seedUsers();
    await seedSprints();
    await setInitialState();
    
    console.log('\n🎉 Staging database seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log('  - Users: Nate Lubeck, John Mark Lawry');
    console.log('  - Disciplines: All assigned based on their roles');
    console.log('  - Sprints: 6 bi-weekly sprints created');
    console.log('  - Current State: Initial state set');
    
  } catch (error) {
    console.error('💥 Seed process failed:', error);
    process.exit(1);
  }
}

// Run the seed if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { seedUsers, seedSprints, setInitialState };
